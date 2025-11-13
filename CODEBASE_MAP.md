# Cass Architecture Reference

Cass is a lightweight desktop AI assistant built with Electron + React. This document maps the current codebase and highlights the major components and responsibilities so you can navigate and reason about the project quickly.

## Core Design Principles

- Fail-fast for critical paths: surface clear errors for capture or API failures
- Process isolation: Electron main handles system ops; React renderer handles UI
- Platform-specific optimization: Chromium/Electron loopback is used for system audio on macOS
- Best‑effort invisibility: native screen-protection is no longer enforced; behavior depends on the sharing tool (see README)

## Process Architecture

```
┌─────────────────┐    ┌─────────────────┐
│ React Frontend  │◄──►│ Electron Main   │
│ (src/)          │    │ (electron/)     │
└─────────────────┘    └─────────────────┘
```

## Directory Structure

### `/electron` – Electron Main Process

System-level operations and coordination.

• Main process
- `main/index.ts` – App lifecycle, window management, dependency wiring
- `ipc/index.ts` – IPC handlers for screenshots, processing, window actions, config
- `bridge/preload.ts` – Preload bridge for secure renderer IPC; renderer-side audio capture/mixing

• Services and helpers
- `services/ProcessingHelper.ts` – Gemini API integration and response streaming
- `helpers/ScreenshotHelper.ts` – Cross‑platform screenshot capture and queue management
- `helpers/shortcuts.ts` – Global shortcuts (toggle window, capture, reset, move)

• Loopback audio (macOS)
- `loopback/main.ts` – getDisplayMedia request handler for system audio loopback

• Persistence and types
- `store/config.ts` – Minimal JSON‑backed key–value store (API key, model, profile)
- `types/ipc.ts` – Shared type definitions for main process dependencies

Error handling philosophy
- Fail fast for unrecoverable errors (e.g., screenshot failure)
- User‑friendly errors with actionable messages
- Screen‑capture protection is disabled; invisibility is best‑effort (see README)

### `/src` – React Frontend (Renderer)

React + TypeScript + Tailwind UI.

• Entrypoints and plumbing
- `App.tsx` – App provider setup (TanStack Query) and root
- `main.tsx` – Vite bootstrapping
- `index.css` – Theme tokens and Tailwind base
- `lib.ts` – `cn` utility (clsx + tailwind-merge)
- `types.ts` – Shared renderer types (e.g., `Screenshot`)

• Components
- `components/Main.tsx` – View coordinator; resizes window based on content
- `components/Initial.tsx` – First view; shows captured screenshots + commands
- `components/Response.tsx` – Streams and displays AI responses
- `components/FollowUp.tsx` – Follow‑up capture and response view
- `components/Commands.tsx` – Command bar, shortcuts, and tooltip
- `components/shared/` – Reusable UI (MarkdownSection, Tooltip, LoadingDots)
- `components/ui/` – Shadcn‑derived primitives (dialog, input, select, etc.)

• Utilities
- `utils/` – Platform helpers and screenshot fetching

Responsibilities
- UI rendering and interaction
- Real‑time screenshot preview and management
- AI response display with rich Markdown formatting
- Configuration UI (API key + model) via tooltip
- Window sizing feedback to main via IPC

### System Audio (macOS)

- Implemented via Electron getDisplayMedia with a per‑session DisplayMediaRequestHandler (`electron/loopback/main.ts`)
- Renderer mixes system audio + microphone using Web Audio and MediaRecorder (see `bridge/preload.ts`)

### `/assets` – Application Resources

Static resources for packaging and branding.

- `icons/` – Platform‑specific icons (macOS, Windows)
- Build resources and metadata

### `/build` – Build Configuration

Electron Builder configuration support.

- `entitlements.mac.plist` – macOS entitlements for hardened runtime / notarization
- Code signing and packaging settings

### Supporting Files

Configuration
- `package.json` – Scripts, app builder config, dependencies
- `tsconfig.json` – Renderer TypeScript config
- `tsconfig.electron.json` – Electron main TypeScript config
- `vite.config.ts` – Vite config (incl. electron builds and manual chunks)
- `tailwind.config.js` – Tailwind setup and CSS variables

Development
- `components.json` – Shadcn UI component config
- `postcss.config.js` – PostCSS configuration
- `.gitignore` – Git ignore patterns
- `env.d.ts` – TypeScript env declarations

## Technical Architecture

### Processes

- Main process: Electron main for system operations
- Renderer: React app for UI, screenshot previews, audio capture/mixing

### Communication Flow

1. User input: global shortcuts handled in main (`ShortcutsHelper`)
2. Screenshot capture: `ScreenshotHelper` captures, saves, and queues images
3. Audio capture: renderer captures and mixes system + mic audio
4. AI processing: `ProcessingHelper` sends combined context to Gemini and streams tokens
5. UI updates: IPC events update React views in real time
6. Display: responses render via `MarkdownSection` with GFM support

### Data Management

- Screenshot queues: separate initial and follow‑up queues
- Configuration store: simple JSON‑backed store for API keys, model, and profile
- State sync: real‑time sync between main and renderer via IPC

### Security & Privacy

- Clear error messaging on failure paths
- Permission requests on macOS for screen capture and microphone
- No persistent storage of sensitive audio/visual data beyond temp screenshots
- Code signing and notarization for macOS builds

## Development Workflow

### Build Process

1. Frontend: React app bundled with Vite
2. Main: TypeScript compiled to JavaScript (vite-plugin-electron)
3. Packaging: Electron Builder creates platform‑specific distributions

### Cross‑Platform Support

- macOS: Full functionality (system audio via loopback; mic via getUserMedia)
- Windows: Core functionality (loopback via PowerShell screenshot path; system audio differs)
- Code sharing: Maximum reuse between platforms

### Dependencies

- Frontend: React, TypeScript, Tailwind CSS, TanStack Query, react-markdown, remark-gfm, react-syntax-highlighter
- Backend: Electron, @google/genai, screenshot-desktop (Windows fallback)
- Native: None required for audio (loopback handled via Chromium)

This map reflects the current repository layout and behavior. For screen‑sharing expectations and user‑facing notes, see `README.md`.
