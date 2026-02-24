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

const CONFIG_FILENAME = "metabase.config.json";

const { activate, deactivate } = defineExtension(() => {
  const workspaceFolders = useWorkspaceFolders();
  const configExists = ref(false);

  const catalogProvider = new CatalogTreeProvider();
  const contentProvider = new ContentTreeProvider();

  window.registerTreeDataProvider("metabase.dataCatalog", catalogProvider);
  window.registerTreeDataProvider("metabase.content", contentProvider);

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
