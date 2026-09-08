// Mapa base: OpenFreeMap (vector, gratuito, sin API key).
// Si prefieres tiles raster de OSM, cambia MAP_STYLE por un objeto style
// con una fuente "raster" apuntando a tile.openstreetmap.org.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE,
  center: [-100.309, 25.669], // Monterrey — ajusta al centro de tus datos
  zoom: 11,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

const loadedLayers = new Set();
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

function renderPanel(layers) {
  listEl.innerHTML = "";
  layers.forEach((layer) => {
    const row = document.createElement("label");
    row.className = "layer-row";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = layer.color;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
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

    const text = document.createElement("span");
    text.className = "layer-text";
    text.innerHTML = `${layer.name} <small>${layer.feature_count}</small>`;

    row.append(checkbox, swatch, text);
    listEl.appendChild(row);
  });
}

async function init() {
  setStatus("Cargando manifest de capas…");
  const res = await fetch("data/layers.json");
  const manifest = await res.json();
  renderPanel(manifest.layers);
  setStatus(`${manifest.layers.length} capas disponibles — actívalas desde el panel`);
}

map.on("load", init);

document.getElementById("panel-toggle").addEventListener("click", () => {
  document.getElementById("panel").classList.toggle("open");
});
