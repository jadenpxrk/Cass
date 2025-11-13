# Cass - Floating Desktop Assistant

**Cass** is your on-screen AI companion. It runs as a floating Electron overlay you can toggle and reposition while it helps with whatever you throw at it—coding drills, multiple-choice questions, planning prompts, or quick definitions mid-call.

Note: Cass no longer attempts to enforce invisibility via OS-level screen filtering. Some meeting tools may capture the window as a normal overlay. If your tool offers advanced screen filtering, you can enable it manually.

## How It Works

1. **Press `Cmd/Ctrl + Enter`** – Capture screenshots and (optionally) audio notes.
2. **AI Analysis** – Screenshots, audio context, and stored session history are streamed to Google Gemini.
3. **Get Smart Responses** – Cass formats output for the task at hand (code fences for LeetCode, clear picks for MCQ, numbered steps for math, structured plans, etc.).
4. **Continue Conversations** – Add context with another `Cmd/Ctrl + Enter` or reset with `Cmd/Ctrl + R`.

Perfect for:

- Technical assessments, LeetCode drills, and code walkthroughs
- Client presentations and sales calls
- Educational lectures, training sessions, and study groups
- Everyday productivity moments where you need a private copilot

## Key Features

- **Lightweight Overlay**: Floating Electron window you can toggle and reposition
- **Audio + Visual Processing**: Combines system audio, microphone input, and screenshot analysis
  - macOS: System audio is captured via Electron loopback (no separate binary). Microphone is mixed in the renderer using Web Audio.
- **Contextual AI Responses**: Powered by Google Gemini with task-aware formatting (code fences for programming, numbered steps for math, MCQ rationales, polished writing assistance, etc.)
- **Follow-up Conversations**: Press `Cmd/Ctrl + Enter` again to continue the conversation with new context; responses stream live so you can read as they generate
- **Reset Functionality**: Press `Cmd/Ctrl + R` to start a fresh session
- **Cross-platform**: Works on macOS and Windows
- **Persistent Configuration**: Remembers API keys and model preferences

### Assistant behavior

- Cass detects common task types and shapes the answer accordingly.
- Coding solutions include fenced code blocks with language hints plus complexity and example walkthroughs.
- Math responses show step-by-step work, labeled formulas, and a clearly called out final answer.
- Multiple-choice answers lead with the correct option, followed by concise reasoning for every choice.
- General planning and writing prompts are formatted with headings or bullet lists to stay scannable.

## Keyboard Shortcuts

- **Cmd/Ctrl + Enter**: Take screenshot and process with AI (includes audio snapshot if recording is active)
- **Cmd/Ctrl + B**: Take a screenshot (adds to queue without processing)
- **Cmd/Ctrl + R**: Reset session and clear context
- **Cmd/Ctrl + \\**: Toggle window visibility
- **Cmd/Ctrl + Q**: Quit the application
- **Arrow keys with Cmd/Ctrl**: Move window around the screen

Recording: use the microphone button in the overlay to start/stop audio capture; there’s no default keyboard shortcut for this.

## Quick Start

1. **Download and install** Cass for your platform
2. **Grant permissions** when prompted (Screen Recording on macOS is required)
3. **Set up your API key** in the configuration tooltip
4. **Press `Cmd/Ctrl + Enter`** to take your first screenshot and start using AI assistance

## Troubleshooting

### App Won't Start on macOS

If screenshots fail or audio is unavailable, ensure Cass has the relevant permissions in System Settings > Privacy & Security (Screen Recording, Microphone). Then restart Cass.

### About Screen Protection

Cass no longer ships a native screen-protection helper. Behavior during screen sharing depends on the conference tool. Some tools offer options to hide overlays; enable them if needed.

 

## Project Structure

- `/electron` - Electron main process files (audio recording, screenshot capture, AI processing)
- `/src` - React frontend components (renderer process UI)
- (no native helpers required)
- `/assets` - Application icons and resources
- `/build` - Build configuration and entitlements
