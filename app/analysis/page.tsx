"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Trade = { returnPct: number; entry: number; exit: number };
type Metrics = { trades: number; net: number; winRate: number; profitFactor: number; maxDrawdown: number; sharpe: number };
type Result = { fast: number; slow: number; train: Metrics; test: Metrics; returns: number[] };
type MonteCarlo = { p5: number; median: number; p95: number; ruinProbability: number; medianDrawdown: number };

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 100_000;

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(text: string): Bar[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 50) throw new Error("El archivo necesita encabezados y al menos 49 velas para un análisis mínimamente útil.");
  const delimiter = [",", ";", "\t"].sort((a, b) => splitCsvLine(lines[0], b).length - splitCsvLine(lines[0], a).length)[0];
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.toLowerCase().replace(/[<>]/g, "").replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const openIndex = find("open", "o");
  const highIndex = find("high", "h");
  const lowIndex = find("low", "l");
  const closeIndex = find("close", "c", "last");
  const dateIndex = find("date", "time", "datetime", "timestamp");
  const timeIndex = find("time");
  if ([openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) {
    throw new Error("No encuentro las columnas OHLC. Usa encabezados como Date, Open, High, Low, Close (también se aceptan encabezados de MetaTrader).");
  }
  const number = (raw: string | undefined) => {
    if (!raw) return NaN;
    const cleaned = raw.trim().replace(/\s/g, "");
    const normalized = delimiter === ";" && cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned;
    return Number(normalized);
  };
  const bars: Bar[] = [];
  for (let row = 1; row < lines.length; row++) {
    const cells = splitCsvLine(lines[row], delimiter);
    const open = number(cells[openIndex]);
    const high = number(cells[highIndex]);
    const low = number(cells[lowIndex]);
    const close = number(cells[closeIndex]);
    if (![open, high, low, close].every(Number.isFinite) || [open, high, low, close].some((price) => price <= 0)) continue;
    const date = dateIndex >= 0 ? (cells[dateIndex] ?? "") : String(row);
    const time = timeIndex >= 0 && timeIndex !== dateIndex ? `${date} ${cells[timeIndex] ?? ""}` : date;
    bars.push({ time, open, high, low, close });
    if (bars.length > MAX_ROWS) throw new Error(`El análisis admite hasta ${MAX_ROWS.toLocaleString("es-ES")} velas por archivo.`);
  }
  if (bars.length < 50) throw new Error("No hay suficientes filas OHLC válidas. Comprueba los precios y los encabezados del CSV.");
  return bars;
}

function ema(values: number[], period: number): number[] {
  const output = new Array<number>(values.length);
  const alpha = 2 / (period + 1);
  output[0] = values[0];
  for (let i = 1; i < values.length; i++) output[i] = values[i] * alpha + output[i - 1] * (1 - alpha);
  return output;
}

function simulate(bars: Bar[], fastPeriod: number, slowPeriod: number, feeBps: number, endIndex = bars.length): Trade[] {
  const closes = bars.slice(0, endIndex).map((bar) => bar.close);
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const trades: Trade[] = [];
  let side: -1 | 0 | 1 = 0;
  let entry = 0;
  let entryIndex = 0;
  const cost = feeBps / 10_000;

  // Signal is read at bar i close and filled at bar i+1 open to avoid look-ahead.
  for (let i = Math.max(slowPeriod, 1); i < endIndex - 1; i++) {
    const crossedUp = fast[i] > slow[i] && fast[i - 1] <= slow[i - 1];
    const crossedDown = fast[i] < slow[i] && fast[i - 1] >= slow[i - 1];
    if (!crossedUp && !crossedDown) continue;
    const nextSide: -1 | 1 = crossedUp ? 1 : -1;
    const fill = bars[i + 1].open;
    if (side !== 0) {
      const raw = side * (fill - entry) / entry;
      trades.push({ returnPct: (raw - cost * 2) * 100, entry, exit: fill });
    }
    if (nextSide !== side) { side = nextSide; entry = fill; entryIndex = i + 1; }
  }
  if (side !== 0 && entryIndex < endIndex - 1) {
    const exit = bars[endIndex - 1].close;
    const raw = side * (exit - entry) / entry;
    trades.push({ returnPct: (raw - cost * 2) * 100, entry, exit });
  }
  return trades;
}

function metrics(trades: Trade[]): Metrics {
  const returns = trades.map((trade) => trade.returnPct / 100);
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let gains = 0;
  let losses = 0;
  let wins = 0;
  for (const result of returns) {
    equity *= Math.max(0, 1 + result);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 1);
    if (result > 0) { gains += result; wins++; } else losses += Math.abs(result);
  }
  const mean = returns.length ? returns.reduce((sum, item) => sum + item, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (returns.length - 1) : 0;
  const deviation = Math.sqrt(variance);
  return {
    trades: trades.length,
    net: (equity - 1) * 100,
    winRate: trades.length ? wins / trades.length * 100 : 0,
    profitFactor: losses === 0 ? (gains > 0 ? 99 : 0) : gains / losses,
    maxDrawdown: maxDrawdown * 100,
    sharpe: deviation > 0 ? mean / deviation * Math.sqrt(returns.length) : 0,
  };
}

function optimize(bars: Bar[], feeBps: number, fastMin: number, fastMax: number, slowMin: number, slowMax: number): Result {
  const split = Math.floor(bars.length * 0.7);
  const trainBars = bars.slice(0, split);
  const holdoutBars = bars.slice(Math.max(0, split - slowMax - 2));
  const offset = Math.max(0, split - slowMax - 2);
  let best: Result | null = null;
  let bestScore = -Infinity;
  let tested = 0;
  for (let fast = fastMin; fast <= fastMax; fast++) {
    for (let slow = Math.max(slowMin, fast + 1); slow <= slowMax; slow++) {
      if (++tested > 1000) throw new Error("La búsqueda supera 1.000 combinaciones. Reduce el rango de parámetros.");
      const trainTrades = simulate(trainBars, fast, slow, feeBps);
      if (trainTrades.length < 3) continue;
      const trainMetrics = metrics(trainTrades);
      // Optimize risk-adjusted in-sample return; holdout data is never used to pick parameters.
      const score = trainMetrics.net - trainMetrics.maxDrawdown * 0.5;
      if (score > bestScore) {
        const fullTest = simulate(bars, fast, slow, feeBps, bars.length);
        const testTrades = fullTest.filter((trade) => {
          // Keep only trades entered during the chronological holdout period.
          const firstHoldoutTime = bars[offset].time;
          const tradeIndex = bars.findIndex((bar) => bar.open === trade.entry);
          return tradeIndex >= split || (tradeIndex < 0 && firstHoldoutTime.length > 0);
        });
        // Re-run on holdout with indicator warm-up, then retain trades after the split.
        const holdoutTradesAll = simulate(holdoutBars, fast, slow, feeBps);
        const holdoutTrades = holdoutTradesAll.filter((trade) => {
          const entryIndex = holdoutBars.findIndex((bar) => bar.open === trade.entry);
          return entryIndex >= split - offset;
        });
        void testTrades;
        bestScore = score;
        best = { fast, slow, train: trainMetrics, test: metrics(holdoutTrades), returns: holdoutTrades.map((trade) => trade.returnPct) };
      }
    }
  }
  if (!best) throw new Error("No se encontraron operaciones suficientes para optimizar. Amplía el histórico o ajusta los rangos.");
  return best;
}

function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function monteCarlo(tradeReturns: number[], seed = 89173): MonteCarlo {
  if (tradeReturns.length < 2) throw new Error("La prueba Monte Carlo necesita al menos 2 operaciones fuera de muestra.");
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const finals: number[] = [];
  const drawdowns: number[] = [];
  let ruined = 0;
  const simulations = 1000;
  const sampleLength = tradeReturns.length;
  for (let run = 0; run < simulations; run++) {
    let equity = 1;
    let peak = 1;
    let maxDd = 0;
    for (let step = 0; step < sampleLength; step++) {
      const sampled = tradeReturns[Math.floor(random() * sampleLength)] / 100;
      equity *= Math.max(0, 1 + sampled);
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 1);
    }
    finals.push((equity - 1) * 100);
    drawdowns.push(maxDd * 100);
    if (equity < 0.5) ruined++;
  }
  finals.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  return { p5: percentile(finals, 0.05), median: percentile(finals, 0.5), p95: percentile(finals, 0.95), ruinProbability: ruined / simulations * 100, medianDrawdown: percentile(drawdowns, 0.5) };
}

function fmt(value: number, digits = 2) { return Number.isFinite(value) ? value.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—"; }

export default function AnalysisPage() {
  const [bars, setBars] = useState<Bar[]>([]);
  const [fileName, setFileName] = useState("");
  const [fastMin, setFastMin] = useState(5);
  const [fastMax, setFastMax] = useState(15);
  const [slowMin, setSlowMin] = useState(20);
  const [slowMax, setSlowMax] = useState(50);
  const [feeBps, setFeeBps] = useState(2);
  const [result, setResult] = useState<Result | null>(null);
  const [mc, setMc] = useState<MonteCarlo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dateRange = useMemo(() => bars.length ? `${bars[0].time} — ${bars[bars.length - 1].time}` : "", [bars]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null); setMc(null);
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Selecciona un archivo CSV."); return; }
    if (file.size > MAX_FILE_BYTES) { setError("El archivo supera el límite de 15 MB."); return; }
    try {
      const parsed = parseCsv(await file.text());
      setBars(parsed); setFileName(file.name);
    } catch (reason) { setBars([]); setFileName(""); setError(reason instanceof Error ? reason.message : "No se pudo leer el CSV."); }
  }

  function runAnalysis() {
    setError(""); setResult(null); setMc(null);
    if (!bars.length) { setError("Carga primero un histórico CSV OHLC."); return; }
    if (fastMin < 2 || fastMax < fastMin || slowMin < 3 || slowMax < slowMin || fastMax >= slowMax || feeBps < 0) { setError("Revisa los rangos: los periodos deben ser positivos, el máximo rápido menor que el máximo lento y los costes no negativos."); return; }
    setBusy(true);
    window.setTimeout(() => {
      try {
        const optimized = optimize(bars, feeBps, fastMin, fastMax, slowMin, slowMax);
        setResult(optimized);
        try { setMc(monteCarlo(optimized.returns)); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ejecutar Monte Carlo."); }
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Error durante el análisis."); }
      finally { setBusy(false); }
    }, 20);
  }

  return <main className="analysis-page">
    <header className="analysis-header"><a className="analysis-brand" href="/">EA <span>CONSTRUCTOR</span></a><a className="back-link" href="/">← Volver al constructor</a></header>
    <div className="analysis-content">
      <div className="analysis-kicker"><span/> RESEARCH LAB · ANÁLISIS HISTÓRICO</div>
      <h1>Optimización <span>fuera de muestra.</span></h1>
      <p className="analysis-lead">Busca parámetros EMA en datos históricos reales, reserva el tramo final como prueba fuera de muestra y evalúa la dispersión de resultados con Monte Carlo.</p>
      <div className="analysis-warning"><strong>Importante:</strong> los resultados dependen del CSV y de los costes que configures. Esto es un backtest local simplificado, no un Strategy Tester de MetaTrader ni una predicción. No hay ejecución de órdenes ni garantía de rendimiento.</div>

      <section className="analysis-card upload-card"><div className="analysis-section-title"><span>01</span><div><h2>Histórico de mercado</h2><p>CSV OHLC: Date/Time, Open, High, Low, Close. Sin subir datos al servidor.</p></div></div><label className="upload-zone"><input type="file" accept=".csv,text/csv" onChange={onFileChange}/><span className="upload-mark">↑</span><strong>{fileName || "Selecciona o arrastra un CSV"}</strong><small>{bars.length ? `${bars.length.toLocaleString("es-ES")} velas · ${dateRange}` : "MetaTrader: exporta el histórico como CSV · Máximo 15 MB"}</small></label></section>

      <section className="analysis-card"><div className="analysis-section-title"><span>02</span><div><h2>Parámetros de optimización</h2><p>Grid search por rendimiento neto ajustado por drawdown en el primer 70%.</p></div></div><div className="analysis-input-grid"><label>EMA rápida — desde<input type="number" min="2" value={fastMin} onChange={(e) => setFastMin(Number(e.target.value))}/></label><label>EMA rápida — hasta<input type="number" min="2" value={fastMax} onChange={(e) => setFastMax(Number(e.target.value))}/></label><label>EMA lenta — desde<input type="number" min="3" value={slowMin} onChange={(e) => setSlowMin(Number(e.target.value))}/></label><label>EMA lenta — hasta<input type="number" min="3" value={slowMax} onChange={(e) => setSlowMax(Number(e.target.value))}/></label><label>Coste por lado (bps)<input type="number" min="0" step="0.1" value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))}/></label></div><p className="split-note"><b>Separación temporal:</b> 70% entrenamiento · 30% holdout. La selección de parámetros solo mira entrenamiento; las operaciones de prueba se generan con el tramo final.</p><button className="run-button" onClick={runAnalysis} disabled={busy || !bars.length}>{busy ? "Calculando…" : "Ejecutar optimización + Monte Carlo →"}</button>{error && <p className="analysis-error" role="alert">{error}</p>}</section>

      {result && <><section className="analysis-card result-card"><div className="analysis-section-title"><span>03</span><div><h2>Resultado histórico</h2><p>Mejor combinación según el score de entrenamiento · el tramo holdout no participa en la selección.</p></div></div><div className="best-params"><div><small>EMA RÁPIDA</small><strong>{result.fast}</strong></div><div><small>EMA LENTA</small><strong>{result.slow}</strong></div><div><small>RANGO CSV</small><strong className="range-value">{dateRange}</strong></div></div><div className="metrics-columns"><MetricGroup title="ENTRENAMIENTO · 70%" metrics={result.train}/><MetricGroup title="FUERA DE MUESTRA · 30%" metrics={result.test}/></div><p className="split-note">La simulación usa cruce EMA al cierre y ejecuta en la apertura de la siguiente vela. Resta costes configurados; no modela spread variable, slippage, swaps, comisiones específicas, gaps intrabar ni restricciones del broker.</p></section>
      {mc && <section className="analysis-card monte-card"><div className="analysis-section-title"><span>04</span><div><h2>Monte Carlo · remuestreo de operaciones</h2><p>1.000 secuencias de la distribución holdout, con reemplazo y longitud igual al número de operaciones observadas.</p></div></div><div className="mc-grid"><div><small>RETORNO P5</small><strong className={mc.p5 < 0 ? "negative" : ""}>{fmt(mc.p5)}%</strong></div><div><small>MEDIANA</small><strong>{fmt(mc.median)}%</strong></div><div><small>RETORNO P95</small><strong>{fmt(mc.p95)}%</strong></div><div><small>DRAWDOWN MEDIANO</small><strong>{fmt(mc.medianDrawdown)}%</strong></div><div><small>RIESGO DE −50%*</small><strong>{fmt(mc.ruinProbability)}%</strong></div></div><p className="split-note">* Frecuencia de caminos simulados que terminan con equity menor al 50% del inicial. Monte Carlo reordena/remuestrea únicamente operaciones del holdout; no representa todos los riesgos de mercado.</p></section>}</>}
      <footer className="analysis-footer">EA CONSTRUCTOR · Herramienta educativa de análisis. El rendimiento pasado no garantiza resultados futuros.</footer>
    </div>
  </main>;
}

function MetricGroup({ title, metrics: values }: { title: string; metrics: Metrics }) {
  return <div className="metric-group"><h3>{title}</h3><div className="metric-grid"><Metric label="Retorno compuesto" value={`${fmt(values.net)}%`} negative={values.net < 0}/><Metric label="Operaciones" value={String(values.trades)} /><Metric label="Win rate" value={`${fmt(values.winRate)}%`}/><Metric label="Profit factor" value={fmt(values.profitFactor, 2)}/><Metric label="Max drawdown" value={`${fmt(values.maxDrawdown)}%`} negative={values.maxDrawdown > 25}/><Metric label="Sharpe por operación*" value={fmt(values.sharpe, 2)}/></div></div>;
}
function Metric({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) { return <div className="metric"><small>{label}</small><strong className={negative ? "negative" : ""}>{value}</strong></div>; }
