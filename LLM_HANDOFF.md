# LLM Handoff Document

## Project Overview
**FLUX Studio — BFL API Suite**
A local desktop application built with Electron that provides a full GUI for interacting with the Black Forest Labs (BFL) API and Topaz Labs API. 

## Tech Stack & Architecture
- **Frontend**: Vanilla JavaScript (`public/app.js`), HTML (`public/index.html`), and CSS (`public/index.css`). No heavy frontend frameworks.
- **Backend**: Express.js server (`server.js`) handles all API requests (BFL and Topaz) securely without exposing API keys to the client.
- **Desktop Wrapper**: Electron (`electron/main.cjs` and `electron/preload.cjs`).
- **CI/CD**: GitHub Actions are configured to automatically build cross-platform binaries (macOS `.dmg` and Windows `.exe`) on tag pushes.

## Core Features & Integrations
- **BFL API (`api.bfl.ai/v1`)**: Handles Generate, Inpaint, Erase, Outpaint, Virtual Try-On (VTO), and Deblur endpoints.
- **Topaz API**: Handles image upscaling.
- **State Management**: Simple DOM manipulation and local states in `app.js`. Costs and API keys are managed locally.

## Recent Work & Important Discoveries
### Outpaint 16px Grid Alignment (Fixed in `v2.3.2`)
- **The Bug**: The BFL `flux-tools/outpainting-v1` endpoint was returning a massive solid blue/green background instead of actually outpainting the image.
- **The Cause**: FLUX models require their tensors to operate on a strict **16px grid**. While the overall canvas `width` and `height` were correctly clamped to multiples of 16, the inner placement offsets (`reference_offset_x`, `reference_offset_y`) and scaled source dimensions (`sw`, `sh`) were being computed as raw integers. When the API received unaligned dimensions, the tensor model aborted, and the API silently returned its internal preparation canvas (which is colored blue/green/magenta, as the model is specifically trained to replace those solid colors).
- **The Fix**: Updated `_opComputeBox()` in `public/app.js` to strictly mathematically snap `sw`, `sh`, `ox`, and `oy` to 16px intervals. This allows the model to process the tensor successfully.

## Current State
- The outpaint bug is fully resolved.
- Version **`v2.3.2`** was just tagged and pushed to GitHub.
- GitHub Actions has successfully built or is finishing the release binaries.
- The project is in a stable, working state.

## Getting Started on the New Machine
1. Clone the repository and run `npm install`.
2. Ensure you have your `.env` file set up (copy from `.env.example`) or configure keys directly within the app UI.
3. Run `npm start` to launch the development environment.
4. If modifying release builds, use `npm version patch` followed by `git push --follow-tags` to trigger GitHub Actions.
