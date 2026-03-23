# 🌊 TideNet

A multi-agent simulation where autonomous entities behave like ocean tides — rising, falling, and carrying knowledge through dynamic information currents.

## Instalación y arranque

```bash
npm install
npm run dev
```

Abre → http://localhost:3000

## Build para producción

```bash
npm run build
npm start
```

## Estructura

```
tidenet/
├── pages/
│   ├── _app.js       ← entry point Next.js
│   └── index.js      ← toda la app (landing + simulación)
├── package.json
├── next.config.js
└── jsconfig.json
```

## Requisitos

- Node.js 18+
- npm 9+

Todo el código está en `pages/index.js`. No hay dependencias adicionales.
