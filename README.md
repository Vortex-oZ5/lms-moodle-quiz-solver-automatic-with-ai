# LMS Moodle Quiz Solver Automatic with AI

## ⚡ Vortex Super Mode

**Fast local question scanning • AI Study • resilient AI connectivity • draggable Super Mode UI**

![Version](https://img.shields.io/badge/Version-3.8.3-635bff?style=for-the-badge)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-14b9d6?style=for-the-badge)
![Creator](https://img.shields.io/badge/Creator-VorteX-111827?style=for-the-badge)
![Open Source](https://img.shields.io/badge/Open%20Source-Yes-22c55e?style=for-the-badge)

![Vortex loading animation](docs/vortex-loading.gif)

> **Repository:** `lms-moodle-quiz-solver-automatic-with-ai`

## 📌 Why the previous README showed code instead of the design

The previous README was converted through a document conversion step that produced `{=html}` artifacts. GitHub then displayed those fragments as code.

This version is **pure GitHub-compatible Markdown**. It does not depend on raw HTML/CSS/JavaScript for the layout.

Also, GitHub README files do not execute arbitrary CSS or JavaScript animations. The loading animation above is therefore an **animated GIF**, which GitHub renders directly.

---

## 🚀 Overview

**LMS Moodle Quiz Solver Automatic with AI** is a Chromium/Chrome Manifest V3 extension built around the **Vortex Super Mode** interface.

It combines:

- Local question scanning
- Question/option extraction
- Duplicate filtering
- Answer-key presentation
- Optional AI Study
- Multiple AI providers
- Local settings
- Draggable floating controls
- Futuristic dark UI
- Loading and interaction effects
- Retry and timeout handling
- Gemini model recovery

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔎 Local MCQ scanner | Detects common radio, checkbox and ARIA structures |
| 🧩 Parser | Normalizes question and option text |
| ♻️ Duplicate filtering | Reduces duplicate results |
| 🕷️ Vortex button | Draggable floating control |
| ⚡ Super Mode | Compact scanning/AI panel |
| 📋 Answer Key | Displays extracted question data |
| 🤖 AI Study | Optional AI-assisted analysis |
| 🔌 AI providers | OpenAI, Gemini, Anthropic, Groq, OpenRouter and custom OpenAI-compatible |
| 💾 Local settings | Provider/model settings stored locally |
| 🔁 Retry system | Handles selected transient failures |
| ⏱️ Timeout | 30-second AI request timeout |
| ♻️ Gemini recovery | Handles unavailable saved Gemini model IDs |
| 🌑 Futuristic UI | Dark glass-style interface |
| 🎨 Themes | Customizable colors and effects |
| 📦 Manifest V3 | Modern Chromium extension architecture |

---

# 🖥️ Screenshots

## 1. Extension Popup

![Extension popup](docs/screenshots/01-extension-popup.png)

Shows:

- Vortex branding
- Open Super Mode
- Question count
- Saved count
- Extension state
- Moodle status
- Creator attribution

---

## 2. AI Settings

![AI settings](docs/screenshots/02-ai-settings.png)

Shows:

- Provider selection
- API key field
- Model field
- Save settings
- Connection test
- Local storage notice

The actual project page is:

```text
api-settings.html
```

---

## 3. Vortex Super Mode

![Super Mode overlay](docs/screenshots/03-super-mode-overlay.png)

Shows:

- Floating Vortex control
- Super Mode panel
- Scan Page
- AI Study
- Question count
- Saved count
- Moodle status

Main overlay styles are in:

```text
styles/content.css
```

---

## 4. Scanner Workflow

![Scanner workflow](docs/screenshots/04-scan-workflow.png)

```text
PAGE
 ↓
SCAN
 ↓
PARSE / NORMALIZE
 ↓
DUPLICATE FILTER
 ↓
ANSWER KEY
 ↓
OPTIONAL AI STUDY
```

---

# 🎬 Animations & Effects

The repository includes:

```text
docs/vortex-loading.gif
```

This is a real animated GIF and is intentionally used instead of custom HTML/CSS animation because GitHub README pages sanitize and do not execute arbitrary JavaScript/CSS.

### UI animation concepts

- Floating button hover
- Press scaling
- Dragging state
- Panel transitions
- Scan loading indicators
- AI activity indicators
- Success states
- Gradient/glow effects
- Skeleton loading
- Theme transitions
- Reduced-motion support

---

# 🎨 Themes

Suggested built-in/custom theme directions:

### Vortex Dark

```text
Navy + Indigo + Cyan + Glass
```

### Neon

```text
Black + Purple + Cyan + Glow
```

### Minimal

```text
Dark Gray + White + Subtle Borders
```

### Light

```text
White + Gray + Indigo
```

Main customization files:

```text
styles/content.css
styles/settings.css
popup/popup.css
```

---

# 🤖 AI Providers

Supported provider categories:

- OpenAI
- Google Gemini
- Anthropic Claude
- Groq
- OpenRouter
- Custom OpenAI-compatible APIs

Provider model names and endpoints can change. Update them in the settings page when required.

---

# 📂 Project Structure

```text
lms-moodle-quiz-solver-automatic-with-ai/
├── manifest.json
├── background.js
├── content.js
├── api-settings.html
├── api-settings.js
├── README.md
├── popup/
├── assets/
├── modules/
├── styles/
└── docs/
    ├── screenshots/
    │   ├── 01-extension-popup.png
    │   ├── 02-ai-settings.png
    │   ├── 03-super-mode-overlay.png
    │   └── 04-scan-workflow.png
    └── vortex-loading.gif
```

---

# ⬇️ Download

## ZIP

On GitHub:

```text
Code → Download ZIP → Extract
```

## Git

```bash
git clone https://github.com/<your-username>/lms-moodle-quiz-solver-automatic-with-ai.git
cd lms-moodle-quiz-solver-automatic-with-ai
```

---

# 🛠️ Installation

### Chrome / Chromium / Edge

1. Download or clone the repository.
2. Extract the ZIP.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the **root project folder** containing `manifest.json`.
7. Pin the extension if desired.

Do **not** select only the `popup` folder.

The selected root must contain:

```text
manifest.json
background.js
content.js
popup/
modules/
styles/
assets/
```

---

# 🔑 AI Setup

1. Install the extension.
2. Open the extension settings/options page.
3. Select the AI provider.
4. Enter the API key.
5. Select/enter the model.
6. Enter an endpoint if using a custom OpenAI-compatible provider.
7. Click **Save API settings**.
8. Click **Test connection**.
9. Return to the target page.
10. Use **AI Study** when needed.

AI settings are stored through:

```text
chrome.storage.local
```

Never commit real API keys to GitHub.

---

# 🔎 How the Scanner Works

### 1. Radio groups

Traditional multiple-choice radio structures can be detected and grouped.

### 2. Checkbox groups

Checkbox-based question structures receive separate handling.

### 3. ARIA controls

Modern forms can expose controls through ARIA semantics.

### 4. Google Forms patterns

Additional handling exists for common Google Forms-style structures.

### 5. Duplicate filtering

Question text is normalized and filtered to reduce duplicate results.

---

# 🔁 Reliability

The supplied source includes:

- 30-second AI request timeout
- Retry handling
- Network/rate-limit/server failure handling
- Gemini model discovery/recovery
- Local storage helpers
- Question normalization
- Duplicate filtering

---

# 🔐 Privacy & Security

The extension requests page access because it needs to inspect supported question controls.

Review:

```text
manifest.json
```

before installation.

API keys are sensitive credentials. Never publish:

```text
API keys
Access tokens
Passwords
Private credentials
```

Use the project only on pages where you are permitted to use it.

---

# 🐛 Troubleshooting

### Extension does not appear

Check Developer mode, the selected root folder, `manifest.json`, and the browser's extension error panel.

### Questions are not detected

Check that questions are visible, the page has finished loading, and the controls use a supported structure.

### AI connection fails

Verify:

```text
API key
Provider
Endpoint
Model
Account/quota
Network connection
```

Then use **Test connection**.

### Gemini model error

Update the saved Gemini model in AI settings if it is no longer available.

---

# 🌐 Open-Source Disclaimer

This project is provided as an **open-source project by VorteX**.

You may:

- Use it as a base
- Study the source
- Modify the UI
- Redesign the interface
- Add features
- Change themes
- Create derivative versions
- Adapt it for permitted environments

## ⭐ Credit Requirement

If you reuse, modify, redistribute, or publish a derivative version, **please keep clear credit to the original creator, VorteX**.

Do not remove the original attribution and present the entire project as though you created it from scratch.

Recommended attribution:

```text
Original Project: Vortex Super Mode
Creator: VorteX
Repository: lms-moodle-quiz-solver-automatic-with-ai
```

---

# ⚠️ Responsible-Use Disclaimer

Use this project according to:

- Your institution's rules
- LMS terms of service
- Assessment policies
- Applicable laws
- AI provider terms
- Website policies

Do not use it to bypass access controls, defeat security mechanisms, or violate assessment rules.

The creator is not responsible for misuse, academic-policy violations, account restrictions, API charges, or third-party provider changes.

---

# 👑 Creator

## ⚡ VorteX

**Creator / Developer**

```text
Project:
LMS Moodle Quiz Solver Automatic with AI

Core UI:
Vortex Super Mode

Creator:
VorteX

Version:
3.8.3

Architecture:
Chromium Manifest V3
```

---

# 📜 License Note

No formal OSI license file was included in the supplied source archive.

If you want legally explicit permissions for modification and redistribution, add a `LICENSE` file with the terms you want to grant.

---

## ⚡ Built with a Vortex mindset

**Fast • Modular • Customizable**

**Created by VorteX**
