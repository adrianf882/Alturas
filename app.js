/* ==========================================================================
   Río · Nivel y pronóstico — lógica de datos
   Fuente: API pública INA (alerta.ina.gob.ar)
   ========================================================================== */

// Estaciones disponibles: siteCode (dato observado) + seriesId/calId (pronóstico).
// Estos valores se relevaron a mano navegando /pub/gui/seriesProno — la API
// no ofrece un endpoint simple para derivarlos automáticamente por nombre.
const STATIONS = [
  { name: "Corrientes",   siteCode: 19, seriesId: 1540, calId: 289 },
  { name: "Barranqueras", siteCode: 20, seriesId: 3523, calId: 289 },
  { name: "Goya",         siteCode: 23, seriesId: 3524, calId: 289 },
  { name: "Reconquista",  siteCode: 24, seriesId: 3526, calId: 289 },
  { name: "La Paz",       siteCode: 26, seriesId: 3527, calId: 289 },
  { name: "Paraná",       siteCode: 29, seriesId: 3408, calId: 289 },
  { name: "Santa Fe",     siteCode: 30, seriesId: 1542, calId: 289 },
  { name: "Rosario",      siteCode: 34, seriesId: 3412, calId: 289 },
  { name: "San Nicolás",  siteCode: 36, seriesId: 3414, calId: 442 },
];

const API_BASE = "https://alerta.ina.gob.ar/pub/datos";
const STORAGE_KEY = "rio-widget-station";

const els = {
  select: document.getElementById("stationSelect"),
  stationName: document.getElementById("stationName"),
  currentValue: document.getElementById("currentValue"),
  updatedAt: document.getElementById("updatedAt"),
  fcLabel1: document.getElementById("fcLabel1"),
  fcDelta1: document.getElementById("fcDelta1"),
  fcAbs1: document.getElementById("fcAbs1"),
  fcLabel2: document.getElementById("fcLabel2"),
  fcDelta2: document.getElementById("fcDelta2"),
  fcAbs2: document.getElementById("fcAbs2"),
  status: document.getElementById("status"),
  staffSvg: document.getElementById("staffSvg"),
};

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isError);
}

// ---- Fetch: valor observado más reciente -----------------------------------
async function fetchCurrent(station) {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 86400000); // ventana de 10 días
  const url = `${API_BASE}/datos&siteCode=${station.siteCode}&varId=2` +
              `&timeStart=${fmtDate(start)}&timeEnd=${fmtDate(end)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const data = json.data || [];
  if (!data.length) throw new Error("Sin datos observados recientes");
  data.sort((a, b) => new Date(a.timestart) - new Date(b.timestart));
  const last = data[data.length - 1];
  return { value: last.valor, date: new Date(last.timestart) };
}

// ---- Fetch: pronóstico -------------------------------------------------------
// La API devuelve, para cada fecha de horizonte, 3 filas (banda min/central/max)
// sin un campo explícito que las distinga -> se ordenan por valor y se toma
// la mediana como estimación central.
async function fetchForecast(station) {
  const start = new Date();
  const end = new Date(start.getTime() + 20 * 86400000);
  const url = `${API_BASE}/datosProno&seriesId=${station.seriesId}&calId=${station.calId}` +
              `&timeStart=${fmtDate(start)}&timeEnd=${fmtDate(end)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const data = json.data || [];
  if (!data.length) throw new Error("Sin pronóstico disponible");

  // agrupar por timestart
  const groups = new Map();
  for (const row of data) {
    const key = row.timestart;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.valor);
  }
  const horizons = Array.from(groups.entries())
    .map(([ts, vals]) => {
      vals.sort((a, b) => a - b);
      const central = vals[Math.floor(vals.length / 2)];
      return { date: new Date(ts), central, band: vals };
    })
    .sort((a, b) => a.date - b.date);

  const now = new Date();
  // descartar horizontes ya pasados o el "ancla" (mismo día de emisión)
  const future = horizons.filter(h => daysBetween(now, h.date) >= 1);
  return future;
}

// ---- Fetch: metadata de estación (umbrales de alerta) ------------------------
// Nota: no está confirmado que el endpoint "estaciones" acepte filtrar por
// siteCode del lado del servidor, así que se trae el listado completo (ya
// verificado que funciona sin filtros) y se busca el registro acá.
// Se cachea en memoria porque el listado no cambia dentro de una sesión.
let _estacionesCache = null;
async function fetchAllStations() {
  if (_estacionesCache) return _estacionesCache;
  const url = `${API_BASE}/estaciones&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  _estacionesCache = json.data || [];
  return _estacionesCache;
}

async function fetchStationMeta(station) {
  const all = await fetchAllStations();
  return all.find(s => s.sitecode === station.siteCode) || {};
}

// ---- Render: escala hidrométrica (SVG) ---------------------------------------
function renderStaff(current, meta) {
  const svg = els.staffSvg;
  svg.innerHTML = "";
  const W = 26, H = 150, pad = 10;
  const lowRaw = meta && meta.nivel_de_aguas_bajas;
  const alertRaw = meta && meta.nivel_de_alerta;
  const evacRaw = meta && meta.nivel_de_evacuacion;

  const hasThresholds = [lowRaw, alertRaw, evacRaw].every(v => typeof v === "number");

  const ns = "http://www.w3.org/2000/svg";
  const track = document.createElementNS(ns, "line");
  track.setAttribute("x1", W / 2); track.setAttribute("x2", W / 2);
  track.setAttribute("y1", pad); track.setAttribute("y2", H - pad);
  track.setAttribute("stroke", "rgba(239,234,224,0.25)");
  track.setAttribute("stroke-width", "3");
  track.setAttribute("stroke-linecap", "round");
  svg.appendChild(track);

  if (!hasThresholds || typeof current !== "number") {
    return; // sin umbrales conocidos: solo se muestra la barra neutra
  }

  // escala: low -> abajo de todo, evac*1.15 -> arriba de todo (deja margen)
  const scaleMin = Math.min(lowRaw, current) - 0.3;
  const scaleMax = Math.max(evacRaw, current) + 0.3;
  const y = (v) => H - pad - ((v - scaleMin) / (scaleMax - scaleMin)) * (H - 2 * pad);

  function band(v0, v1, color) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", W / 2); line.setAttribute("x2", W / 2);
    line.setAttribute("y1", y(v0)); line.setAttribute("y2", y(v1));
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  }
  band(alertRaw, evacRaw, "rgba(193,68,59,0.65)");   // alerta -> evacuación
  band(lowRaw, alertRaw, "rgba(95,168,184,0.35)");   // aguas bajas -> alerta

  // marcador del valor actual
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", W / 2);
  dot.setAttribute("cy", y(current));
  dot.setAttribute("r", "5");
  dot.setAttribute("fill", current >= alertRaw ? "#C1443B" : "#EFEAE0");
  dot.setAttribute("stroke", "#16232B");
  dot.setAttribute("stroke-width", "2");
  svg.appendChild(dot);
}

// ---- Render principal ---------------------------------------------------------
function renderForecastRow(labelEl, deltaEl, absEl, horizon, current) {
  if (!horizon) {
    labelEl.textContent = "—";
    deltaEl.textContent = "—";
    deltaEl.className = "fc-delta";
    absEl.textContent = "";
    return;
  }
  const days = daysBetween(new Date(), horizon.date);
  const delta = horizon.central - current;
  const sign = delta >= 0 ? "+" : "";
  labelEl.textContent = `+${days} d`;
  deltaEl.textContent = `${sign}${delta.toFixed(2)}`;
  deltaEl.className = "fc-delta " + (delta >= 0 ? "rise" : "fall");
  absEl.textContent = `(${horizon.central.toFixed(2)} m)`;
}

async function loadStation(station) {
  setStatus("Cargando…");
  els.stationName.textContent = station.name;
  try {
    const [current, forecast, meta] = await Promise.all([
      fetchCurrent(station),
      fetchForecast(station),
      fetchStationMeta(station).catch(() => null),
    ]);

    els.currentValue.innerHTML = current.value.toFixed(2) + '<span class="unit">m</span>';
    els.updatedAt.textContent = "actualizado " +
      current.date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
      " " + current.date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    renderForecastRow(els.fcLabel1, els.fcDelta1, els.fcAbs1, forecast[0], current.value);
    renderForecastRow(els.fcLabel2, els.fcDelta2, els.fcAbs2, forecast[1], current.value);

    renderStaff(current.value, meta);
    setStatus("");
  } catch (err) {
    setStatus("No se pudo cargar (" + err.message + ")", true);
  }
}

function populateSelect() {
  els.select.innerHTML = "";
  for (const s of STATIONS) {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    els.select.appendChild(opt);
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && STATIONS.some(s => s.name === saved)) {
    els.select.value = saved;
  }
}

els.select.addEventListener("change", () => {
  const station = STATIONS.find(s => s.name === els.select.value);
  localStorage.setItem(STORAGE_KEY, station.name);
  loadStation(station);
});

populateSelect();
loadStation(STATIONS.find(s => s.name === els.select.value) || STATIONS[0]);

// refresco automático cada 30 minutos
setInterval(() => {
  const station = STATIONS.find(s => s.name === els.select.value);
  if (station) loadStation(station);
}, 30 * 60 * 1000);
