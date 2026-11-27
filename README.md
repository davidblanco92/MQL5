# EA CONSTRUCTOR

Constructor visual de estrategias con exportación de código fuente inicial para MetaTrader 4 y MetaTrader 5. No requiere registro: la configuración vive en el estado de la sesión del navegador y no se envía a un servidor.

## Funciones del MVP

- Selección de instrumento, temporalidad y plataforma MT4/MT5.
- Reglas de cruce EMA y filtro RSI.
- Parámetros editables de riesgo, stop loss y take profit.
- Vista previa de estrategia y código generado.
- Descarga de archivo `.mq4` o `.mq5`.

## Ejecutar localmente

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Para validar tipos y construir la aplicación:

```bash
npm run typecheck
npm run build
```

## Alcance y seguridad

El código exportado es una plantilla inicial de estrategia, no una garantía de rentabilidad ni asesoramiento financiero. Revísalo, compílalo en MetaEditor y pruébalo en Strategy Tester/cuenta demo antes de cualquier uso real. Este MVP no se conecta a brokers, no ejecuta operaciones y no ofrece backtesting real.
