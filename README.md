# EA CONSTRUCTOR

Constructor visual de estrategias sin registro, con generación local de código fuente MT4/MT5 y análisis cuantitativo de históricos CSV OHLC.

## Funciones

- Selección de instrumento, temporalidad y plataforma MT4/MT5.
- Reglas de cruce EMA y filtro RSI; configuración de stop loss y take profit.
- Descarga de plantilla fuente `.mq4` o `.mq5`.
- Laboratorio de análisis disponible en `/analysis`: optimización por grid search de parámetros EMA, evaluación cronológica 70/30 fuera de muestra y bootstrap Monte Carlo de 1.000 secuencias.
- El histórico CSV se procesa en el navegador; no se necesita una cuenta ni subir datos a un servidor.

## Ejecutar localmente

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:3000 para el constructor y http://localhost:3000/analysis para optimización y Monte Carlo. Comprueba el proyecto con:

```bash
npm run typecheck
npm run build
```

## Formato de datos de análisis

Sube CSV OHLC con encabezados `Date,Open,High,Low,Close` o columnas equivalentes de MetaTrader. El sistema exige al menos 50 velas, admite hasta 100.000 filas/15 MB y usa la apertura de la siguiente vela para llenar señales calculadas al cierre. Se puede configurar un coste por lado en puntos básicos. El primer 70% se usa para seleccionar parámetros y el último 30% se reserva como holdout.

## Limitaciones importantes

Es un motor local y simplificado, no el Strategy Tester de MetaTrader ni un feed de broker. No modela spread variable, slippage, swaps, comisiones particulares, ejecución intrabar, restricciones de lote ni todos los detalles de MT4/MT5. El Monte Carlo remuestrea con reemplazo los retornos de operaciones del tramo holdout; sus percentiles no son una predicción ni una garantía. Valida resultados con históricos limpios, costes realistas y MetaTrader Strategy Tester antes de considerar cualquier uso. No es asesoramiento financiero.
