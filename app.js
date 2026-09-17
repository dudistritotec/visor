// Mapa base: OpenFreeMap (vector, gratuito, sin API key).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE,
  center: [-100.309, 25.669], // Monterrey — ajusta al centro de tus datos
  zoom: 11,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

const loadedLayers = new Set();
const purpleAirWidgets = new Map(); // sensorId -> div ya cargado con el widget
const statusEl = document.getElementById("status-text");
const listEl = document.getElementById("layer-list");

function setStatus(text) {
  statusEl.textContent = text;
}

function paintForType(type, color) {
  // Un solo estilo de dibujo por tipo geométrico dominante de la capa.
  if (type === "polygon") {
    return [
      { type: "fill", paint: { "fill-color": color, "fill-opacity": 0.25 } },
      { type: "line", paint: { "line-color": color, "line-width": 1.5 } },
    ];
  }
  if (type === "line") {
    return [{ type: "line", paint: { "line-color": color, "line-width": 2.5 } }];
  }
  return [
    {
      type: "circle",
      paint: {
        "circle-color": color,
        "circle-radius": 5,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    },
  ];
}

async function activateLayer(layer, popupToggle) {
  if (loadedLayers.has(layer.id)) return;
  setStatus(`Descargando ${layer.name}…`);

  const res = await fetch(layer.file);
  const geojson = await res.json();

  map.addSource(layer.id, { type: "geojson", data: geojson });

  // Capa de sensores PurpleAir: precargar cada widget UNA sola vez
  // (en vez de al hacer click), para que ya esté listo cuando se abra el popup.
  if (layer.id === "Calidad del Aire__purpleair") {
    let holding = document.getElementById("purpleair-widget-holding");
    if (!holding) {
      holding = document.createElement("div");
      holding.id = "purpleair-widget-holding";
      holding.style.display = "none";
      document.body.appendChild(holding);
    }
    geojson.features.forEach((f) => {
      const sensorId = f.properties.ID;
      if (purpleAirWidgets.has(sensorId)) return;

      const wrap = document.createElement("div");
      wrap.className = "popup-purpleair";

      const title = document.createElement("strong");
      title.textContent = f.properties.sensor ?? "Sensor";

      const widgetDivId = `PurpleAirWidget_${sensorId}_module_US_EPA_AQI_conversion_C0_average_10_layer_US_EPA_AQI`;
      const widgetDiv = document.createElement("div");
      widgetDiv.id = widgetDivId;
      widgetDiv.textContent = "Cargando widget PurpleAir…";

      const fallback = document.createElement("a");
      fallback.href = `https://www.purpleair.com/map?select=${sensorId}`;
      fallback.target = "_blank";
      fallback.rel = "noopener";
      fallback.className = "popup-purpleair-fallback";
      fallback.textContent = "Ver en purpleair.com ↗";
      fallback.style.display = "none";

      wrap.append(title, widgetDiv, fallback);
      holding.appendChild(wrap);
      purpleAirWidgets.set(sensorId, wrap);

      // Si el widget no reemplazó su contenido en 8s, se asume que falló
      // (script bloqueado, sensor caído, red lenta) y se muestra el enlace.
      setTimeout(() => {
        if (widgetDiv.textContent === "Cargando widget PurpleAir…") {
          fallback.style.display = "inline-block";
        }
      }, 8000);

      const script = document.createElement("script");
      script.src = `https://www.purpleair.com/pa.widget.js?module=US_EPA_AQI&conversion=C0&average=10&layer=US_EPA_AQI&container=${widgetDivId}`;
      document.body.appendChild(script);
    });
  }

  paintForType(layer.type, layer.color).forEach((def, i) => {
    map.addLayer({
      id: `${layer.id}__${def.type}`,
      type: def.type,
      source: layer.id,
      paint: def.paint,
    });
  });

  // Popup simple con las propiedades del feature al hacer click.
  const clickLayerId = `${layer.id}__${layer.type === "point" ? "circle" : layer.type === "line" ? "line" : "fill"}`;
  map.on("click", clickLayerId, (e) => {
    const props = e.features[0].properties;

    // Capa de sensores PurpleAir: mostrar el widget que ya se precargó
    // al activar la capa (ver activateLayer), no crear uno nuevo aquí.
    if (layer.id === "Calidad del Aire__purpleair") {
      const wrap = purpleAirWidgets.get(props.ID);
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setDOMContent(wrap ?? document.createTextNode("Widget no disponible"))
        .addTo(map);
      return;
    }

    const rows = Object.entries(props)
      .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
      .join("");
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<table class="popup-table">${rows}</table>`)
      .addTo(map);
  });
  map.on("mouseenter", clickLayerId, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", clickLayerId, () => (map.getCanvas().style.cursor = ""));

  loadedLayers.add(layer.id);
  setStatus(`${layer.name}: ${layer.feature_count} elementos cargados`);
}

function setLayerVisible(layer, visible) {
  const suffix = layer.type === "point" ? "circle" : layer.type === "line" ? "line" : ["fill", "line"];
  const ids = Array.isArray(suffix) ? suffix.map((s) => `${layer.id}__${s}`) : [`${layer.id}__${suffix}`];
  ids.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
}

function makeLayerRow(layer, indent) {
  const row = document.createElement("label");
  row.className = "layer-row";
  if (indent) row.classList.add("indent");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.layerId = layer.id;

  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = layer.color;

  const text = document.createElement("span");
  text.className = "layer-text";
  text.innerHTML = `${layer.name} <small>${layer.feature_count}</small>`;

  row.append(checkbox, swatch, text);

  checkbox.addEventListener("change", async (e) => {
    if (e.target.checked) {
      await activateLayer(layer);
      setLayerVisible(layer, true);
      if (layer.bbox) {
        map.fitBounds(
          [
            [layer.bbox[0], layer.bbox[1]],
            [layer.bbox[2], layer.bbox[3]],
          ],
          { padding: 60, maxZoom: 15, duration: 600 }
        );
      }
    } else {
      setLayerVisible(layer, false);
    }
  });

  return { row, checkbox };
}

function makeGroup(group) {
  const wrap = document.createElement("div");
  wrap.className = "layer-group collapsed"; // colapsado por defecto

  const header = document.createElement("div");
  header.className = "group-header";

  const arrow = document.createElement("span");
  arrow.className = "group-arrow";
  arrow.textContent = "▸";

  const groupCheckbox = document.createElement("input");
  groupCheckbox.type = "checkbox";
  groupCheckbox.className = "group-checkbox";

  const groupName = document.createElement("span");
  groupName.className = "group-name";
  groupName.innerHTML = `${group.name} <small>${group.layers.length}</small>`;

  header.append(arrow, groupCheckbox, groupName);

  const body = document.createElement("div");
  body.className = "group-body";

  const childCheckboxes = [];
  group.layers.forEach((layer) => {
    const { row, checkbox } = makeLayerRow(layer, true);
    body.appendChild(row);
    childCheckboxes.push(checkbox);
    checkbox.addEventListener("change", () => syncGroupCheckbox(groupCheckbox, childCheckboxes));
  });

  // Click en el nombre/flecha expande o colapsa; el checkbox no.
  header.addEventListener("click", (e) => {
    if (e.target === groupCheckbox) return;
    wrap.classList.toggle("collapsed");
  });

  // Checkbox del grupo activa/desactiva todas sus capas de golpe.
  groupCheckbox.addEventListener("change", () => {
    groupCheckbox.indeterminate = false;
    childCheckboxes.forEach((cb) => {
      if (cb.checked !== groupCheckbox.checked) {
        cb.checked = groupCheckbox.checked;
        cb.dispatchEvent(new Event("change"));
      }
    });
  });

  wrap.append(header, body);
  return wrap;
}

function syncGroupCheckbox(groupCheckbox, childCheckboxes) {
  const checkedCount = childCheckboxes.filter((cb) => cb.checked).length;
  if (checkedCount === 0) {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = false;
  } else if (checkedCount === childCheckboxes.length) {
    groupCheckbox.checked = true;
    groupCheckbox.indeterminate = false;
  } else {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = true;
  }
}

function renderPanel(manifest) {
  listEl.innerHTML = "";

  // Capas sueltas (raíz de data/): siempre visibles, sin colapsar.
  manifest.root_layers.forEach((layer) => {
    const { row } = makeLayerRow(layer, false);
    listEl.appendChild(row);
  });

  // Capas agrupadas (subcarpetas de data/): colapsadas por defecto.
  manifest.groups.forEach((group) => {
    listEl.appendChild(makeGroup(group));
  });
}

async function init() {
  setStatus("Cargando manifest de capas…");
  const res = await fetch("data/layers.json");
  const manifest = await res.json();
  renderPanel(manifest);
  const total = manifest.root_layers.length + manifest.groups.reduce((n, g) => n + g.layers.length, 0);
  setStatus(`${total} capas disponibles — actívalas desde el panel`);
}

map.on("load", init);

document.getElementById("panel-toggle").addEventListener("click", () => {
  document.getElementById("panel").classList.toggle("open");
});
