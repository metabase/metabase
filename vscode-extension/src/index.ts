import {
  ref,
  watch,
} from "@reactive-vscode/reactivity";
import {
  defineExtension,
  useFileSystemWatcher,
  useWorkspaceFolders,
  useCommand,
  useExtensionSecret,
} from "reactive-vscode";
import { commands, Diagnostic, DiagnosticSeverity, languages, Range, Uri, window, workspace } from "vscode";
import { loadMetabaseExport, parseDirectory, buildDependencyGraph, CatalogGraph, ContentGraph } from "./metabase-lib";
import type { DependencyGraphResult } from "./metabase-lib";
import { CatalogTreeProvider } from "./catalog-tree-provider";
import { ContentTreeProvider } from "./content-tree-provider";
import { ConnectionTreeProvider } from "./connection-tree-provider";
import { config } from './config'
import { checkMetabaseConnection } from './metabase-client'

const CONFIG_FILENAME = "metabase.config.json";

const { activate, deactivate } = defineExtension((context) => {
  const extensionPath = context.extensionPath;
  const apiKey = useExtensionSecret('apiKey')
  const workspaceFolders = useWorkspaceFolders();
  const configExists = ref(false);

  const connectionProvider = new ConnectionTreeProvider(
    () => config.host ?? '',
    () => !!apiKey.value,
  )
  const catalogProvider = new CatalogTreeProvider(extensionPath);
  const contentProvider = new ContentTreeProvider(extensionPath);

  window.registerTreeDataProvider("metabase.connection", connectionProvider);
  window.registerTreeDataProvider("metabase.dataCatalog", catalogProvider);
  window.registerTreeDataProvider("metabase.content", contentProvider);

  useCommand('metastudio.setHost', async () => {
    const current = config.host ?? ''
    const value = await window.showInputBox({
      prompt: 'Enter your Metabase instance URL',
      placeHolder: 'https://my-metabase.example.com',
      value: current,
    })
    if (value !== undefined) {
      await workspace.getConfiguration('metastudio').update('host', value, true)
      connectionProvider.refresh()
    }
  })

  useCommand('metastudio.setApiKey', async () => {
    const value = await window.showInputBox({
      prompt: 'Enter your Metabase API key',
      password: true,
      ignoreFocusOut: true,
    })
    if (value !== undefined) {
      await apiKey.set(value)
      connectionProvider.refresh()
      window.showInformationMessage('API key saved securely.')
    }
  })

  useCommand('metastudio.clearCredentials', async () => {
    await workspace.getConfiguration('metastudio').update('host', '', true)
    await apiKey.set('')
    connectionProvider.refresh()
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

  const diagnosticCollection = languages.createDiagnosticCollection("metabase-dependencies");
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    commands.registerCommand("metabase.checkDependencies", async () => {
      const folders = workspaceFolders.value;
      if (!folders?.length) {
        window.showWarningMessage("No workspace folder open.");
        return;
      }

      const rootPath = folders[0].uri.fsPath;
      const configUri = Uri.joinPath(folders[0].uri, CONFIG_FILENAME);
      try {
        await workspace.fs.stat(configUri);
      } catch {
        window.showWarningMessage(`No ${CONFIG_FILENAME} found in workspace root.`);
        return;
      }

      await window.withProgress(
        { location: { viewId: "metabase.content" }, title: "Checking dependencies..." },
        async () => {
          try {
            const entities = await parseDirectory(rootPath);
            const catalog = CatalogGraph.build(entities);
            const content = ContentGraph.build(entities);
            const result: DependencyGraphResult = buildDependencyGraph(entities, catalog, content);

            diagnosticCollection.clear();
            const diagnosticsByFile = new Map<string, Diagnostic[]>();

            for (const issue of result.issues) {
              if (!issue.filePath) continue;
              const severity = issue.severity === "error"
                ? DiagnosticSeverity.Error
                : DiagnosticSeverity.Warning;
              const diagnostic = new Diagnostic(new Range(0, 0, 0, 0), issue.message, severity);
              diagnostic.source = "metabase-dependencies";

              const existing = diagnosticsByFile.get(issue.filePath) ?? [];
              existing.push(diagnostic);
              diagnosticsByFile.set(issue.filePath, existing);
            }

            for (const cycle of result.cycles) {
              const names = cycle.path.map(entity => entity.name);
              const message = `Dependency cycle: ${names.join(" → ")} → ${names[0]}`;
              for (const entity of cycle.path) {
                if (!entity.filePath) continue;
                const diagnostic = new Diagnostic(
                  new Range(0, 0, 0, 0),
                  message,
                  DiagnosticSeverity.Warning,
                );
                diagnostic.source = "metabase-dependencies";
                const existing = diagnosticsByFile.get(entity.filePath) ?? [];
                existing.push(diagnostic);
                diagnosticsByFile.set(entity.filePath, existing);
              }
            }

            for (const [filePath, diagnostics] of diagnosticsByFile) {
              diagnosticCollection.set(Uri.file(filePath), diagnostics);
            }

            const errorCount = result.issues.filter(issue => issue.severity === "error").length;
            const warningCount = result.issues.filter(issue => issue.severity === "warning").length;
            const cycleCount = result.cycles.length;

            if (errorCount === 0 && warningCount === 0 && cycleCount === 0) {
              window.showInformationMessage(
                `Dependency check passed. ${result.entities.size} entities, ${result.edges.length} dependencies, no issues.`
              );
            } else {
              const parts: string[] = [];
              if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
              if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);
              if (cycleCount > 0) parts.push(`${cycleCount} cycle${cycleCount > 1 ? "s" : ""}`);
              window.showWarningMessage(`Dependency check: ${parts.join(", ")}. See Problems panel.`);
            }
          } catch (error) {
            window.showErrorMessage(`Dependency check failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
      );
    }),
  );
});

export { activate, deactivate };
