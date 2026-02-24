import {
  ref,
  watch,
} from "@reactive-vscode/reactivity";
import {
  defineExtension,
  useFileSystemWatcher,
  useWorkspaceFolders,
} from "reactive-vscode";
import { commands, Uri, window, workspace } from "vscode";
import { loadMetabaseExport } from "./metabase-lib";
import { CatalogTreeProvider } from "./catalog-tree-provider";
import { ContentTreeProvider } from "./content-tree-provider";
import { useCommand, useExtensionSecret } from 'reactive-vscode'
import { config } from './config'
import { checkMetabaseConnection } from './metabase-client'

const CONFIG_FILENAME = "metabase.config.json";

const { activate, deactivate } = defineExtension(() => {
  const apiKey = useExtensionSecret('apiKey')
  const workspaceFolders = useWorkspaceFolders();
  const configExists = ref(false);

  const catalogProvider = new CatalogTreeProvider();
  const contentProvider = new ContentTreeProvider();

  window.registerTreeDataProvider("metabase.dataCatalog", catalogProvider);
  window.registerTreeDataProvider("metabase.content", contentProvider);
  window.showInformationMessage(`Host: ${config.host}`)

  async function checkConfigExists() {
    const folders = workspaceFolders.value;
    if (!folders?.length) {
      configExists.value = false;
      return;
    }

    const configUri = Uri.joinPath(folders[0].uri, CONFIG_FILENAME);
    try {
      await workspace.fs.stat(configUri);
      configExists.value = true;
    } catch {
      configExists.value = false;
    }
  }

  checkConfigExists();

  useFileSystemWatcher(`**/${CONFIG_FILENAME}`, {
    onDidCreate: checkConfigExists,
    onDidDelete: checkConfigExists,
  });

  useCommand('metastudio.setApiKey', async () => {
    const value = await window.showInputBox({
      prompt: 'Enter your Metabase API key',
      password: true,
      ignoreFocusOut: true,
    })
    if (value !== undefined) {
      await apiKey.set(value)
      window.showInformationMessage('API key saved securely.')
    }
  })

  useCommand('metastudio.checkConnection', async () => {
    const result = await checkMetabaseConnection(config.host, apiKey.value ?? undefined)

    switch (result.status) {
      case 'missing-host':
        window.showErrorMessage('Metabase host is not configured. Set it in Settings under "metastudio.host".')
        break
      case 'missing-api-key': {
        const action = await window.showWarningMessage('No API key set.', 'Set API Key')
        if (action === 'Set API Key') {
          commands.executeCommand('metastudio.setApiKey')
        }
        break
      }
      case 'unauthorized':
        window.showErrorMessage('Authentication failed. Check your API key.')
        break
      case 'network-error':
        window.showErrorMessage(`Could not reach Metabase: ${result.message}`)
        break
      case 'http-error':
        window.showErrorMessage(`Metabase returned HTTP ${result.statusCode}: ${result.statusText}`)
        break
      case 'success':
        window.showInformationMessage(`Metabase connection successful`)
        break
    }
  })

  async function loadExport() {
    const folders = workspaceFolders.value;
    if (!configExists.value || !folders?.length) {
      catalogProvider.setGraph(null);
      contentProvider.setGraph(null);
      return;
    }

    try {
      const rootPath = folders[0].uri.fsPath;
      const { catalog, content } = await loadMetabaseExport(rootPath);
      catalogProvider.setGraph(catalog);
      contentProvider.setGraph(content);
    } catch {
      catalogProvider.setGraph(null);
      contentProvider.setGraph(null);
    }
  }

  watch(configExists, (value) => {
    commands.executeCommand("setContext", "metabase.configExists", value);
    loadExport();
  });

  useFileSystemWatcher("**/*.yaml", {
    onDidCreate: loadExport,
    onDidChange: loadExport,
    onDidDelete: loadExport,
  });
});

export { activate, deactivate };
