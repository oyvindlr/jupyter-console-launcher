'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Derive the raw path to the `jupyter` executable given a Python interpreter path.
 * Returns null if the derived path doesn't exist (caller should fall back to sendText).
 */
function jupyterExeFromPython(pythonPath) {
    if (!pythonPath) return null;
    const dir = path.dirname(pythonPath);
    const candidate = process.platform === 'win32'
        ? path.join(dir, 'jupyter.exe')
        : path.join(dir, 'jupyter');
    return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Get the connection file and jupyter executable for the active notebook's kernel.
 * Uses the official `api.kernels.getKernel(uri)` API which prompts the user for
 * access on first use (no publisher trust list restrictions).
 */
async function getKernelInfo(notebookUri) {
    const jupyterExt = vscode.extensions.getExtension('ms-toolsai.jupyter');
    if (!jupyterExt) throw new Error('The Jupyter extension (ms-toolsai.jupyter) is not installed.');

    const api = await jupyterExt.activate();
    if (!api || !api.kernels) {
        throw new Error('Jupyter extension API unavailable. Try updating the Jupyter extension.');
    }

    const kernel = await api.kernels.getKernel(notebookUri);
    if (!kernel) {
        throw new Error(
            'No active kernel found. Please run a cell first to start the kernel, then try again.'
        );
    }

    // Get the Python interpreter path to find jupyter in the same venv
    let pythonPath;
    try {
        if (api.getPythonEnvironment) {
            const env = await api.getPythonEnvironment(notebookUri);
            pythonPath = env && (env.path || (env.executable && env.executable.uri &&
                vscode.Uri.parse(env.executable.uri).fsPath));
        }
    } catch (_) {
        // Not critical — fall back to bare "jupyter"
    }
    const jupyterExe = jupyterExeFromPython(pythonPath);

    // Execute ipykernel.get_connection_file() in the kernel to get the connection file path
    const code = 'import ipykernel as _jcl_ipyk; print(_jcl_ipyk.get_connection_file()); del _jcl_ipyk';

    const tokenSource = new vscode.CancellationTokenSource();
    let stdout = '';
    try {
        for await (const output of kernel.executeCode(code, tokenSource.token)) {
            for (const item of output.items) {
                if (item.mime.includes('stdout') || item.mime === 'text/plain') {
                    if (typeof item.data === 'string') {
                        stdout += item.data;
                    } else if (item.data && typeof item.data.toString === 'function' && !(item.data instanceof Uint8Array)) {
                        stdout += item.data.toString();
                    } else if (item.data && item.data.length > 0) {
                        stdout += new TextDecoder().decode(item.data);
                    }
                }
            }
        }
    } finally {
        tokenSource.dispose();
    }

    const connectionFile = stdout.trim();
    if (!connectionFile) {
        throw new Error('Could not determine the kernel connection file path.');
    }

    return { connectionFile, jupyterExe };
}

/**
 * Main command handler.
 */
async function openJupyterConsole() {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) {
        vscode.window.showErrorMessage(
            'Jupyter Console: No active notebook editor. Please focus a Jupyter notebook first.'
        );
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Jupyter Console: connecting to kernel…',
            cancellable: false,
        },
        async () => {
            let info;
            try {
                info = await getKernelInfo(editor.notebook.uri);
            } catch (err) {
                vscode.window.showErrorMessage(`Jupyter Console: ${err.message}`);
                return;
            }

            const existing = vscode.window.terminals.find(t => t.name === 'Jupyter Console');
            if (existing) existing.dispose();

            // Temporarily disable Python's venv auto-activation so it doesn't fire
            // into the jupyter console session after it starts.
            const pyConfig = vscode.workspace.getConfiguration('python');
            const savedActivate = pyConfig.inspect('terminal.activateEnvironment')?.globalValue;
            await pyConfig.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Global);

            const termOpts = info.jupyterExe
                ? { name: 'Jupyter Console', shellPath: info.jupyterExe,
                    shellArgs: ['console', '--existing', info.connectionFile] }
                : { name: 'Jupyter Console' };

            const terminal = vscode.window.createTerminal(termOpts);
            terminal.show(/* preserveFocus */ false);

            if (!info.jupyterExe) {
                // Fallback: jupyter not found in venv, run via PATH in the shell
                await new Promise(resolve => setTimeout(resolve, 1500));
                terminal.sendText(`jupyter console --existing "${info.connectionFile}"`);
            }

            // Restore the setting once the terminal's onDidOpenTerminal handlers have run
            setTimeout(async () => {
                try {
                    await pyConfig.update('terminal.activateEnvironment', savedActivate,
                        vscode.ConfigurationTarget.Global);
                } catch (_) {}
            }, 2000);
        }
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand('jupyter-console.openConsole', openJupyterConsole)
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
