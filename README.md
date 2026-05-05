# Jupyter Console Launcher

Opens a `jupyter console --existing` session connected to the **exact kernel** that is active in the current VS Code notebook — no manual `%connect_info` needed.

## Usage

With a `.ipynb` notebook open and a kernel running, trigger the command in any of these ways:

| Method | Action |
|---|---|
| Keyboard shortcut | `Ctrl+Shift+J` (Windows/Linux) / `Cmd+Shift+J` (Mac) |
| Notebook toolbar | Click the **terminal icon** that appears in the notebook toolbar |
| Command palette | `Ctrl+Shift+P` → **Open Jupyter Console for Active Kernel** |

A new terminal opens running:
```
jupyter console --existing /path/to/kernel-<uuid>.json
```

## Requirements

- VS Code ≥ 1.85
- [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) (`ms-toolsai.jupyter`)
- `jupyter_console` installed in the active Python environment  
  (`pip install jupyter_console`)

## First use — granting kernel access

On first use, VS Code will show a one-time dialog:

> *Do you want to grant Kernel access to the extension Jupyter Console Launcher?*

Click **Allow**. This is the standard VS Code mechanism for third-party extensions that access Jupyter kernels. The decision is remembered permanently.

## Installation (local / unpacked)

Since this extension is not on the Marketplace, install it manually:

1. Copy the extension folder into your VS Code extensions directory, naming it `oyvindlr.jupyter-console-launcher-0.1.0`:
   - **Windows:** `%USERPROFILE%\.vscode\extensions\`
   - **macOS/Linux:** `~/.vscode/extensions/`
2. Register it by adding an entry to `extensions.json` in the same directory (see below).
3. Restart VS Code.

Alternatively, open the source folder in VS Code and press **F5** to launch an Extension Development Host.

## How it works

When you trigger the command, the extension:

1. Calls the Jupyter extension's `kernels.getKernel(uri)` API to obtain the kernel attached to the active notebook.
2. Executes `ipykernel.get_connection_file()` inside that kernel to get the exact connection file path.
3. Resolves the `jupyter` executable from the same Python environment used by the kernel (venv, conda, or global).
4. Opens a new VS Code terminal running `jupyter console --existing "<connection-file>"`.

The kernel's namespace is not polluted — the helper import is deleted immediately after use.

### Notes on virtual environments

If the kernel uses a local `.venv`, the extension locates `jupyter` inside that venv automatically. The terminal is created before VS Code's Python extension activates the venv, so venv auto-activation is temporarily suppressed during terminal creation and then restored — avoiding stray activation output appearing in the console session.
