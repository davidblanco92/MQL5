"use client";

import { useMemo, useState } from "react";

type Platform = "MT5" | "MT4";
type Signal = "Moving Average crossover" | "RSI reversal";

const initialSignals: Signal[] = ["Moving Average crossover"];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    sliders: <><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2" fill="currentColor"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 6-7"/></>,
    code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    arrow: <><path d="M7 17 17 7"/><path d="M7 7h10v10"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    bolt: <><path d="m13 2-3 8h7l-6 12 1-9H5l8-11z"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.grid}</svg>;
}

function makeSource(platform: Platform, symbol: string, timeframe: string, signals: Signal[], fast: number, slow: number, rsiPeriod: number, stopLoss: number, takeProfit: number, risk: number) {
  const signalText = signals.includes("RSI reversal")
    ? `   double rsi = ${platform === "MT5" ? "rsiBuffer[0]" : `iRSI(Symbol(), ${timeframe}, ${rsiPeriod}, PRICE_CLOSE, 1)`};\n   bool buySignal = ${platform === "MT5" ? "fastBuffer[1] > slowBuffer[1] && fastBuffer[2] <= slowBuffer[2] && rsi < 30" : `iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 1) > iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 1) && iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 2) <= iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 2) && rsi < 30`};\n   bool sellSignal = ${platform === "MT5" ? "fastBuffer[1] < slowBuffer[1] && fastBuffer[2] >= slowBuffer[2] && rsi > 70" : `iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 1) < iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 1) && iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 2) >= iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 2) && rsi > 70`};`
    : platform === "MT5"
      ? "   bool buySignal = fastBuffer[1] > slowBuffer[1] && fastBuffer[2] <= slowBuffer[2];\n   bool sellSignal = fastBuffer[1] < slowBuffer[1] && fastBuffer[2] >= slowBuffer[2];"
      : `   bool buySignal = iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 1) > iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 1) && iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 2) <= iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 2);\n   bool sellSignal = iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 1) < iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 1) && iMA(Symbol(), ${timeframe}, ${fast}, 0, MODE_EMA, PRICE_CLOSE, 2) >= iMA(Symbol(), ${timeframe}, ${slow}, 0, MODE_EMA, PRICE_CLOSE, 2);`;

  if (platform === "MT5") {
    const rsiHandle = signals.includes("RSI reversal") ? `int rsiHandle;\ndouble rsiBuffer[];\n` : "";
    const rsiInit = signals.includes("RSI reversal") ? `   rsiHandle = iRSI(_Symbol, PERIOD_${timeframe}, ${rsiPeriod}, PRICE_CLOSE);\n   if(rsiHandle == INVALID_HANDLE) return INIT_FAILED;\n` : "";
    const rsiCopy = signals.includes("RSI reversal") ? `   ArraySetAsSeries(rsiBuffer, true);\n   if(CopyBuffer(rsiHandle, 0, 0, 3, rsiBuffer) < 3) return;\n` : "";
    const rsiRelease = signals.includes("RSI reversal") ? "   IndicatorRelease(rsiHandle);\n" : "";
    return `//+------------------------------------------------------------------+\n//| EA Constructor — ${symbol} ${timeframe}                         |\n//| Generado como punto de partida; prueba en Strategy Tester.       |\n//+------------------------------------------------------------------+\n#include <Trade/Trade.mqh>\nCTrade trade;\ninput double Lots = 0.10;\ninput int StopLossPoints = ${stopLoss};\ninput int TakeProfitPoints = ${takeProfit};\ninput double RiskSettingPercent = ${risk}; // Referencia; el lote se define arriba\ninput int FastPeriod = ${fast};\ninput int SlowPeriod = ${slow};\ninput int RsiPeriod = ${rsiPeriod};\nint fastHandle, slowHandle;\n${rsiHandle}double fastBuffer[], slowBuffer[];\n\nint OnInit()\n{\n   fastHandle = iMA(_Symbol, PERIOD_${timeframe}, FastPeriod, 0, MODE_EMA, PRICE_CLOSE);\n   slowHandle = iMA(_Symbol, PERIOD_${timeframe}, SlowPeriod, 0, MODE_EMA, PRICE_CLOSE);\n   if(fastHandle == INVALID_HANDLE || slowHandle == INVALID_HANDLE) return INIT_FAILED;\n${rsiInit}   ArraySetAsSeries(fastBuffer, true);\n   ArraySetAsSeries(slowBuffer, true);\n   return INIT_SUCCEEDED;\n}\n\nvoid OnDeinit(const int reason)\n{\n   IndicatorRelease(fastHandle);\n   IndicatorRelease(slowHandle);\n${rsiRelease}}\n\nvoid OnTick()\n{\n   if(PositionSelect(_Symbol)) return;\n   if(CopyBuffer(fastHandle, 0, 0, 3, fastBuffer) < 3) return;\n   if(CopyBuffer(slowHandle, 0, 0, 3, slowBuffer) < 3) return;\n${rsiCopy}${signalText}\n   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);\n   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);\n   if(buySignal)\n      trade.Buy(Lots, _Symbol, ask, ask - StopLossPoints * _Point, ask + TakeProfitPoints * _Point, "EA Constructor buy");\n   else if(sellSignal)\n      trade.Sell(Lots, _Symbol, bid, bid + StopLossPoints * _Point, bid - TakeProfitPoints * _Point, "EA Constructor sell");\n}\n`;
  }
  return `//+------------------------------------------------------------------+\n//| EA Constructor — ${symbol} ${timeframe}                         |\n//| Generado como punto de partida; prueba en Strategy Tester.       |\n//+------------------------------------------------------------------+\n#property strict\ninput double Lots = 0.10;\ninput int StopLossPoints = ${stopLoss};\ninput int TakeProfitPoints = ${takeProfit};\ninput double RiskSettingPercent = ${risk}; // Referencia; el lote se define arriba\ninput int FastPeriod = ${fast};\ninput int SlowPeriod = ${slow};\ninput int RsiPeriod = ${rsiPeriod};\n\nvoid OnTick()\n{\n   if(OrdersTotal() > 0) return;\n${signalText}\n   if(buySignal)\n   {\n      double sl = Ask - StopLossPoints * Point;\n      double tp = Ask + TakeProfitPoints * Point;\n      OrderSend(Symbol(), OP_BUY, Lots, Ask,  slippage, sl, tp, "EA Constructor buy", 0, 0, clrGreen);\n   }\n   else if(sellSignal)\n   {\n      double sl = Bid + StopLossPoints * Point;\n      double tp = Bid - TakeProfitPoints * Point;\n      OrderSend(Symbol(), OP_SELL, Lots, Bid, slippage, sl, tp, "EA Constructor sell", 0, 0, clrTomato);\n   }\n}\n`;
}

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("MT5");
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("H1");
  const [signals, setSignals] = useState<Signal[]>(initialSignals);
  const [fast, setFast] = useState(9);
  const [slow, setSlow] = useState(21);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [stopLoss, setStopLoss] = useState(300);
  const [takeProfit, setTakeProfit] = useState(600);
  const [risk, setRisk] = useState(1);
  const [showCode, setShowCode] = useState(false);
  const [notice, setNotice] = useState("");
  const source = useMemo(() => makeSource(platform, symbol, timeframe, signals, fast, slow, rsiPeriod, stopLoss, takeProfit, risk), [platform, symbol, timeframe, signals, fast, slow, rsiPeriod, stopLoss, takeProfit, risk]);
  const filename = `${symbol.toLowerCase()}-ea-constructor.${platform === "MT5" ? "mq5" : "mq4"}`;
  const valid = fast > 0 && slow > fast && stopLoss > 0 && takeProfit > 0 && risk > 0 && risk <= 100;

  function toggleSignal(signal: Signal) {
    setSignals((current) => current.includes(signal) ? current.filter((item) => item !== signal) : [...current, signal]);
  }
  function download() {
    if (!valid) { setNotice("Revisa los valores: la media rápida debe ser menor que la lenta y el riesgo debe estar entre 0 y 100%."); return; }
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`${filename} se ha descargado. Ábrelo en MetaEditor y compílalo antes de usarlo.`);
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#workspace" aria-label="EA Constructor inicio"><span className="brand-mark"><Icon name="chart" size={21}/></span><span>EA<span className="brand-light"> CONSTRUCTOR</span></span></a>
      <div className="side-label">WORKSPACE</div>
      <a className="nav-item active" href="#workspace"><Icon name="sliders"/>Constructor</a>
      <a className="nav-item" href="#strategy"><Icon name="grid"/>Mi estrategia</a>
      <a className="nav-item" href="#export"><Icon name="code"/>Exportar EA</a>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><Icon name="bolt"/></span><strong>De idea a EA.</strong><p>Construye tu estrategia y llévala a MetaTrader.</p><a href="#guide">Cómo funciona <Icon name="arrow" size={14}/></a></div><div className="local-badge"><span/> Sesión local · sin registro</div></div>
    </aside>

    <section className="main-area" id="workspace">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Constructor</strong></div><div className="topbar-right"><span className="saved"><span/> Guardado en este dispositivo</span><button className="avatar" aria-label="Sesión local">EC</button></div></header>
      <div className="content-wrap">
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> BUILDER VISUAL</div><h1>Tu estrategia, <span>hecha EA.</span></h1><p>Configura las reglas de tu sistema y genera código para MetaTrader.</p></div><button className="button button-dark" onClick={() => { setShowCode(true); document.getElementById("export")?.scrollIntoView({ behavior: "smooth" }); }}><Icon name="code"/> Ver código</button></section>

        <div className="workspace-grid">
          <div className="builder-column">
            <section className="panel" id="strategy">
              <div className="panel-heading"><div className="step-number">01</div><div><h2>Mercado y plataforma</h2><p>Elige dónde operará tu estrategia.</p></div></div>
              <div className="form-grid market-grid"><label className="field"><span>Instrumento</span><select value={symbol} onChange={(e) => setSymbol(e.target.value)}><option>EURUSD</option><option>GBPUSD</option><option>USDJPY</option><option>XAUUSD</option><option>BTCUSD</option></select></label><label className="field"><span>Temporalidad</span><select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>{["M5","M15","M30","H1","H4","D1"].map((tf) => <option key={tf}>{tf}</option>)}</select></label></div>
              <div className="field-label">Plataforma de destino</div><div className="platform-switch" role="group" aria-label="Plataforma"><button className={platform === "MT5" ? "platform-option selected" : "platform-option"} onClick={() => setPlatform("MT5")}><span className="platform-icon">5</span><span><strong>MetaTrader 5</strong><small>Formato .mq5</small></span>{platform === "MT5" && <Icon name="check" size={17}/>}</button><button className={platform === "MT4" ? "platform-option selected" : "platform-option"} onClick={() => setPlatform("MT4")}><span className="platform-icon">4</span><span><strong>MetaTrader 4</strong><small>Formato .mq4</small></span>{platform === "MT4" && <Icon name="check" size={17}/>}</button></div>
            </section>

            <section className="panel rules-panel">
              <div className="panel-heading"><div className="step-number">02</div><div><h2>Reglas de estrategia</h2><p>Combina señales técnicas para definir tus entradas.</p></div></div>
              <div className="signal-list">
                <button className={signals.includes("Moving Average crossover") ? "signal-card signal-active" : "signal-card"} onClick={() => toggleSignal("Moving Average crossover")}><span className="signal-check">{signals.includes("Moving Average crossover") && <Icon name="check" size={14}/>}</span><span className="signal-symbol">MA</span><span className="signal-copy"><strong>Cruce de medias móviles</strong><small>Entrada cuando la media rápida cruza la lenta.</small></span><span className="signal-tag">TENDENCIA</span></button>
                <button className={signals.includes("RSI reversal") ? "signal-card signal-active" : "signal-card"} onClick={() => toggleSignal("RSI reversal")}><span className="signal-check">{signals.includes("RSI reversal") && <Icon name="check" size={14}/>}</span><span className="signal-symbol rsi-symbol">RSI</span><span className="signal-copy"><strong>Filtro RSI</strong><small>Confirma condiciones de sobrecompra o sobreventa.</small></span><span className="signal-tag violet">MOMENTUM</span></button>
              </div>
              {signals.includes("Moving Average crossover") && <div className="inline-settings"><label className="field"><span>Media rápida (EMA)</span><input type="number" min="1" value={fast} onChange={(e) => setFast(Number(e.target.value))}/></label><label className="field"><span>Media lenta (EMA)</span><input type="number" min="2" value={slow} onChange={(e) => setSlow(Number(e.target.value))}/></label></div>}
              {signals.includes("RSI reversal") && <div className="inline-settings rsi-setting"><label className="field"><span>Periodo RSI</span><input type="number" min="2" value={rsiPeriod} onChange={(e) => setRsiPeriod(Number(e.target.value))}/></label><div className="threshold-info"><span>Compra</span><strong>&lt; 30</strong><span className="threshold-divider"/><span>Venta</span><strong>&gt; 70</strong></div></div>}
              {signals.length === 0 && <div className="empty-rule">Selecciona al menos una señal para generar condiciones de entrada.</div>}
              <button className="add-rule" onClick={() => toggleSignal(signals.includes("RSI reversal") ? "Moving Average crossover" : "RSI reversal")}><Icon name="plus" size={16}/> Añadir {signals.includes("RSI reversal") ? "cruce de medias" : "filtro RSI"}</button>
            </section>

            <section className="panel risk-panel">
              <div className="panel-heading"><div className="step-number">03</div><div><h2>Gestión de riesgo</h2><p>Define los parámetros de protección por operación.</p></div><span className="recommended">RECOMENDADO</span></div>
              <div className="risk-grid"><label className="field"><span>Stop loss <small>(puntos)</small></span><div className="input-suffix"><input type="number" min="1" value={stopLoss} onChange={(e) => setStopLoss(Number(e.target.value))}/><b>pts</b></div></label><label className="field"><span>Take profit <small>(puntos)</small></span><div className="input-suffix"><input type="number" min="1" value={takeProfit} onChange={(e) => setTakeProfit(Number(e.target.value))}/><b>pts</b></div></label><label className="field"><span>Riesgo objetivo</span><div className="input-suffix"><input type="number" min="0.1" max="100" step="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))}/><b>%</b></div></label></div>
              {!valid && <p className="validation-error">Usa valores positivos; la EMA rápida debe ser menor que la lenta y el riesgo no puede superar 100%.</p>}
            </section>
          </div>

          <aside className="preview-column">
            <section className="preview-card"><div className="preview-top"><span className="live-dot"/> VISTA PREVIA <span className="preview-platform">{platform}</span></div><h3>{symbol} <span>·</span> {timeframe}</h3><div className="chart-wrap"><div className="chart-gridlines"><i/><i/><i/><i/></div><div className="chart-label label-top">1.0860</div><div className="chart-label label-mid">1.0820</div><div className="chart-label label-bottom">1.0780</div><svg className="chart-svg" viewBox="0 0 340 150" preserveAspectRatio="none" aria-label="Gráfico ilustrativo"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#56d6a0" stopOpacity=".23"/><stop offset="1" stopColor="#56d6a0" stopOpacity="0"/></linearGradient></defs><path d="M0 113 C20 106 23 119 40 104 S62 95 76 101 S93 81 110 88 S128 97 142 73 S162 81 175 66 S193 72 210 58 S226 69 240 47 S259 54 273 39 S289 54 304 31 S325 38 340 21 V150 H0Z" fill="url(#area)"/><path d="M0 113 C20 106 23 119 40 104 S62 95 76 101 S93 81 110 88 S128 97 142 73 S162 81 175 66 S193 72 210 58 S226 69 240 47 S259 54 273 39 S289 54 304 31 S325 38 340 21" fill="none" stroke="#55d6a0" strokeWidth="2.3" vectorEffect="non-scaling-stroke"/><path d="M0 126 C22 120 31 125 46 117 S70 110 86 108 S112 103 127 96 S152 92 169 83 S195 81 210 73 S235 69 249 60 S277 57 294 48 S320 45 340 39" fill="none" stroke="#8893a8" strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/></svg><span className="chart-time time-left">09:00</span><span className="chart-time time-right">16:00</span></div><div className="preview-stats"><div><small>SEÑALES ACTIVAS</small><strong>{signals.length.toString().padStart(2, "0")}</strong></div><div><small>STOP LOSS</small><strong>{stopLoss} <em>pts</em></strong></div><div><small>TAKE PROFIT</small><strong>{takeProfit} <em>pts</em></strong></div></div><div className="preview-rule"><span className="rule-dot"/><div><strong>Condición de entrada</strong><p>{signals.length ? signals.join(" + ") : "Sin señales seleccionadas"}</p></div></div><div className="preview-note"><Icon name="bolt" size={15}/> Vista ilustrativa · no representa datos de mercado en tiempo real.</div></section>
            <section className="export-card" id="export"><div className="export-icon"><Icon name="code" size={20}/></div><div><h3>Listo para exportar</h3><p>Genera tu archivo fuente para abrirlo en MetaEditor.</p></div><div className="export-file"><span className="file-type">{platform === "MT5" ? "5" : "4"}</span><div><strong>{filename}</strong><small>Código fuente · {platform}</small></div><span className="file-status"><Icon name="check" size={14}/></span></div><button className="button button-primary" onClick={download} disabled={!valid}><Icon name="download"/> Descargar EA <Icon name="arrow" size={15}/></button><button className="code-toggle" onClick={() => setShowCode((value) => !value)}><Icon name="code" size={16}/>{showCode ? "Ocultar código generado" : "Revisar código generado"}<span>{showCode ? "−" : "+"}</span></button>{showCode && <pre className="code-preview"><code>{source}</code></pre>}{notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Cerrar aviso"><Icon name="close" size={14}/></button></div>}</section>
            <p className="disclaimer">El código generado es una plantilla inicial. Revisa y compila en MetaEditor y prueba en una cuenta demo antes de cualquier uso real. No es asesoramiento financiero.</p>
          </aside>
        </div>
        <footer className="footer" id="guide"><span>EA CONSTRUCTOR <span className="footer-muted">· Crea, revisa y exporta.</span></span><span>Tu estrategia se guarda en esta sesión del navegador.</span></footer>
      </div>
    </section>
  </main>;
}
