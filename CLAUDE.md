# Río · Nivel y pronóstico — contexto del proyecto

## Qué es esto
Una PWA (Progressive Web App) minimalista para Android que muestra, para una
estación hidrométrica del río Paraná elegida por el usuario:
- el último nivel observado (m),
- la diferencia de pronóstico a +4 y +11 días (ej. "+0.40", "-0.16"),
- una "escala hidrométrica" (barra vertical tipo regla de río) marcando dónde
  cae el nivel actual respecto a los umbrales de aguas bajas / alerta / evacuación.

Está pensada para eventualmente convertirse en un widget real de pantalla de
inicio (hoy es una PWA instalable, no un AppWidget nativo).

## Archivos
- `index.html` — estructura + CSS inline (sin frameworks, sin build step)
- `app.js` — toda la lógica: fetch a la API, parseo del pronóstico, render
- `manifest.json` — metadata de instalación PWA
- `sw.js` — service worker mínimo (cachea el shell, NUNCA cachea datos de la API)
- `icons/` — íconos PNG generados a mano (192/512, normal + maskable)

## Fuente de datos: API pública de INA
Base: `https://alerta.ina.gob.ar/pub/datos`

Detalles importantes de esta API (relevados a mano, no hay doc formal clara):
- Los parámetros van con `&` pegado al recurso, no con `?`. Ejemplo real que
  funciona: `.../pub/datos/datos&siteCode=30&varId=2&timeStart=2026-08-01&timeEnd=2026-08-08&format=json`
- `datos` = observado. Requiere `siteCode` + `varId` (varId=2 = altura
  hidrométrica) + `timeStart` + `timeEnd`.
- `datosProno` = pronóstico. Requiere `seriesId` + `calId` (no alcanza con
  siteCode/varId) + `timeStart` + `timeEnd`. El `seriesId` y `calId` son
  específicos por estación y no se pueden derivar de una fórmula — hay que
  sacarlos navegando `/pub/gui/seriesProno` a mano (ya están cargados en
  `STATIONS` en app.js para 9 estaciones del corredor Corrientes→San Nicolás).
- La respuesta de `datosProno` da, para cada fecha de horizonte, **3 filas**
  con el mismo `timestart` (probablemente banda min/central/max), sin un
  campo que las distinga explícitamente. `app.js` las ordena y toma la
  mediana como valor central — no está 100% confirmado que esa sea la
  interpretación correcta, es la mejor lectura que pudimos hacer de la data cruda.
- `estaciones` (sin filtro) devuelve el listado completo de estaciones con
  sus umbrales (`nivel_de_alerta`, `nivel_de_evacuacion`, `nivel_de_aguas_bajas`).
  No está confirmado si acepta filtrar por `siteCode` del lado del servidor,
  así que `app.js` trae todo el listado y filtra en el cliente (más lento
  pero seguro).

## Problema pendiente / primera tarea
**Nunca se probó en un navegador real.** Todo lo anterior se armó y verificó
haciendo fetches desde un entorno sandbox sin browser real, así que:

1. Levantar un server local (`python3 -m http.server 8000` o `npx serve`) y
   abrir `index.html` en Chrome de escritorio primero.
2. Revisar la consola (F12) por errores de **CORS** al pegarle a
   `alerta.ina.gob.ar` desde `fetch()` — es el riesgo principal, no está
   confirmado que ese dominio permita peticiones cross-origin desde un
   browser. Si falla: armar un proxy chiquito (Cloudflare Worker, Vercel
   Edge Function, o similar) que reenvíe la petición y agregue los headers
   CORS necesarios, y actualizar `API_BASE` en `app.js` para apuntar ahí.
3. Confirmar que el parseo de `datosProno` (banda de 3 valores → mediana) da
   resultados sensatos comparando contra lo que se ve en
   `https://alerta.ina.gob.ar/a5/diario/reporte_diario` para la misma estación/fecha.
4. Una vez andando local, dejarlo desplegado en algo con HTTPS (GitHub Pages
   es lo más simple y gratis) para poder instalarlo como PWA real en Android
   (Chrome solo ofrece "Instalar app" sobre HTTPS o localhost).

## Preferencias de diseño (si hay que tocar UI)
Sistema de diseño ya definido, mantenerlo si se agregan pantallas o estados:
- Fondo `#16232B` (pizarra oscura, no negro puro), tarjeta `#1F323C`
- Texto `#EFEAE0`, texto secundario `#8FA3AC`
- Números en fuente monoespaciada (look "instrumento de medición")
- Acento "sube" = ámbar `#C97B4C`, acento "baja" = cian `#5FA8B8`, alerta = rojo `#C1443B`
- El motivo visual central es la escala hidrométrica (barra vertical con
  marcador), no un ícono genérico — es intencional, no decoración de relleno.

## Cómo pensar los próximos pasos
Este proyecto viene de una serie de análisis hidrológicos más grandes (series
históricas de Rosario/Túnel/Corrientes, modelos de regresión con lag para
pronóstico). La API de INA terminó siendo mejor fuente que los modelos
caseros para pronóstico (tiene su propio modelo hidrológico), así que este
widget es la punta visible de todo ese trabajo — no hace falta reconstruir
la lógica de regresión acá, es puro consumo de la API oficial.
