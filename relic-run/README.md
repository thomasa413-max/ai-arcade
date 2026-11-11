# Relic Run (source)
Three.js game bundled into one HTML file with esbuild (`node build.mjs`, needs `three` and `esbuild`).
Artwork/textures: `tools/prompts.json` is written by Claude, `tools/generate-images.mjs` calls the OpenAI image API.
Run via the "Generate Relic Run artwork" GitHub Action (secret `OPENAI_API_KEY`) -> `public/games/relic-run/assets/*.webp`.
The game uses those files when present and falls back to procedural textures otherwise.
