import { ref, watch } from "@reactive-vscode/reactivity";
import {
  defineExtension,
  useFileSystemWatcher,
  useWorkspaceFolders,
  useCommand,
  useExtensionSecret,
} from "reactive-vscode";
import {
  commands,
  Diagnostic,
  DiagnosticSeverity,
  env,
  languages,
  Range,
  Uri,
  ViewColumn,
  window,
  workspace,
  type WebviewPanel,
} from "vscode";
import {
  loadMetabaseExport,
  parseDirectory,
  buildDependencyGraph,
  CatalogGraph,
  ContentGraph,
} from "./metabase-lib";
import type { DependencyGraphResult, ContentNode, CatalogNode } from "./metabase-lib";
import { CatalogTreeProvider } from "./catalog-tree-provider";
import { ContentTreeProvider } from "./content-tree-provider";
import { ConnectionTreeProvider } from "./connection-tree-provider";
import { config } from "./config";
import { checkMetabaseConnection } from "./metabase-client";
import { buildGraphViewData } from "./graph-view-data";
import { getWebviewHtml } from "./webview-html";
import { getTransformPreviewHtml } from "./transform-preview-html";
import type { TransformPreviewData } from "./transform-preview-html";
import {
  parseTransformQuery,
  parseTransformTarget,
} from "./transform-query";
import type { TransformNode } from "./metabase-lib";
import type { WebviewToExtensionMessage } from "./shared-types";

const CONFIG_FILENAME = "metabase.config.json";

const { activate, deactivate } = defineExtension((context) => {
  const extensionPath = context.extensionPath;
  const apiKey = useExtensionSecret("apiKey");
  const workspaceFolders = useWorkspaceFolders();
  const configExists = ref(false);

  const connectionProvider = new ConnectionTreeProvider(
    () => config.host ?? "",
    () => !!apiKey.value,
  );
  const catalogProvider = new CatalogTreeProvider(extensionPath);
  const contentProvider = new ContentTreeProvider(extensionPath);

  window.registerTreeDataProvider("metabase.connection", connectionProvider);
  window.registerTreeDataProvider("metabase.dataCatalog", catalogProvider);
  window.registerTreeDataProvider("metabase.content", contentProvider);

  function updateHostConfigured() {
    commands.executeCommand(
      "setContext",
      "metastudio.hostConfigured",
      !!config.host,
    );
  }
  updateHostConfigured();

  workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("metastudio.host")) {
      updateHostConfigured();
    }
  });

  useCommand("metastudio.setHost", async () => {
    const current = config.host ?? "";
    const value = await window.showInputBox({
      prompt: "Enter your Metabase instance URL",
      placeHolder: "https://my-metabase.example.com",
      value: current,
    });
    if (value !== undefined) {
      await workspace
        .getConfiguration("metastudio")
        .update("host", value, true);
      connectionProvider.refresh();
    }
  });

  useCommand("metastudio.setApiKey", async () => {
    const value = await window.showInputBox({
      prompt: "Enter your Metabase API key",
      password: true,
      ignoreFocusOut: true,
    });
    if (value !== undefined) {
      await apiKey.set(value);
      connectionProvider.refresh();
      window.showInformationMessage("API key saved securely.");
    }
  });

  useCommand("metastudio.clearCredentials", async () => {
    await workspace.getConfiguration("metastudio").update("host", "", true);
    await apiKey.set("");
    connectionProvider.refresh();
  });

  useCommand("metastudio.checkConnection", async () => {
    const result = await checkMetabaseConnection(
      config.host,
      apiKey.value ?? undefined,
    );

    switch (result.status) {
      case "missing-host":
        window.showErrorMessage(
          'Metabase host is not configured. Set it in Settings under "metastudio.host".',
        );
        break;
      case "missing-api-key": {
        const action = await window.showWarningMessage(
          "No API key set.",
          "Set API Key",
        );
        if (action === "Set API Key") {
          commands.executeCommand("metastudio.setApiKey");
        }
        break;
      }
      case "unauthorized":
        window.showErrorMessage("Authentication failed. Check your API key.");
        break;
      case "network-error":
        window.showErrorMessage(`Could not reach Metabase: ${result.message}`);
        break;
      case "http-error":
        window.showErrorMessage(
          `Metabase returned HTTP ${result.statusCode}: ${result.statusText}`,
        );
        break;
      case "success":
        window.showInformationMessage(`Metabase connection successful`);
        break;
    }
  });

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
      currentCatalog = catalog;
      catalogProvider.setGraph(catalog);
      contentProvider.setGraph(content);
    } catch {
      currentCatalog = null;
      catalogProvider.setGraph(null);
      contentProvider.setGraph(null);
    }
  }

  watch(configExists, (value) => {
    commands.executeCommand("setContext", "metabase.configExists", value);
    loadExport();
  });

  const diagnosticCollection = languages.createDiagnosticCollection(
    "metabase-dependencies",
  );
  context.subscriptions.push(diagnosticCollection);

  let graphPanel: WebviewPanel | null = null;
  let transformPanel: WebviewPanel | null = null;
  let currentCatalog: CatalogGraph | null = null;
  let pendingFocusNodeKey: string | null = null;

  function publishDiagnostics(result: DependencyGraphResult) {
    diagnosticCollection.clear();
    const diagnosticsByFile = new Map<string, Diagnostic[]>();

    for (const issue of result.issues) {
      if (!issue.filePath) continue;
      const severity =
        issue.severity === "error"
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning;
      const diagnostic = new Diagnostic(
        new Range(0, 0, 0, 0),
        issue.message,
        severity,
      );
      diagnostic.source = "metabase-dependencies";

      const existing = diagnosticsByFile.get(issue.filePath) ?? [];
      existing.push(diagnostic);
      diagnosticsByFile.set(issue.filePath, existing);
    }

    for (const cycle of result.cycles) {
      const names = cycle.path.map((entity) => entity.name);
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
  }

  async function sendGraphDataToWebview(panel: WebviewPanel) {
    const folders = workspaceFolders.value;
    if (!folders?.length || !configExists.value) {
      panel.webview.postMessage({
        type: "init",
        configExists: false,
        nodes: [],
        edges: [],
        issueCount: 0,
        cycleCount: 0,
      });
      return;
    }

    try {
      const rootPath = folders[0].uri.fsPath;
      const entities = await parseDirectory(rootPath);
      const catalog = CatalogGraph.build(entities);
      const content = ContentGraph.build(entities);
      const graphResult = buildDependencyGraph(entities, catalog, content);
      const { nodes, edges } = buildGraphViewData(graphResult, entities);

      publishDiagnostics(graphResult);

      panel.webview.postMessage({
        type: "init",
        configExists: true,
        nodes,
        edges,
        issueCount: graphResult.issues.length,
        cycleCount: graphResult.cycles.length,
      });

      if (pendingFocusNodeKey) {
        panel.webview.postMessage({
          type: "focusNode",
          nodeKey: pendingFocusNodeKey,
        });
        pendingFocusNodeKey = null;
      }
    } catch (error) {
      window.showErrorMessage(
        `Failed to build dependency graph: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  useCommand("metastudio.checkDependencyGraph", async () => {
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
      window.showWarningMessage(
        `No ${CONFIG_FILENAME} found in workspace root.`,
      );
      return;
    }

    await window.withProgress(
      {
        location: { viewId: "metabase.content" },
        title: "Checking dependency graph...",
      },
      async () => {
        try {
          const entities = await parseDirectory(rootPath);
          const catalog = CatalogGraph.build(entities);
          const content = ContentGraph.build(entities);
          const result = buildDependencyGraph(entities, catalog, content);

          publishDiagnostics(result);

          const errorCount = result.issues.filter(
            (issue) => issue.severity === "error",
          ).length;
          const warningCount = result.issues.filter(
            (issue) => issue.severity === "warning",
          ).length;
          const cycleCount = result.cycles.length;

          if (errorCount === 0 && warningCount === 0 && cycleCount === 0) {
            window.showInformationMessage(
              `Dependency check passed. ${result.entities.size} entities, ${result.edges.length} dependencies, no issues.`,
            );
          } else {
            commands.executeCommand("workbench.actions.view.problems");

            const parts: string[] = [];
            if (errorCount > 0)
              parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
            if (warningCount > 0)
              parts.push(
                `${warningCount} warning${warningCount > 1 ? "s" : ""}`,
              );
            if (cycleCount > 0)
              parts.push(`${cycleCount} cycle${cycleCount > 1 ? "s" : ""}`);
            const action = await window.showWarningMessage(
              `Dependency check: ${parts.join(", ")}.`,
              "Show Problems",
            );
            if (action === "Show Problems") {
              commands.executeCommand("workbench.actions.view.problems");
            }
          }
        } catch (error) {
          window.showErrorMessage(
            `Dependency check failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  });

  async function showDependencyGraph(focusNodeKey?: string) {
    if (focusNodeKey) {
      pendingFocusNodeKey = focusNodeKey;
    }

    if (graphPanel) {
      graphPanel.reveal(ViewColumn.One);
      if (pendingFocusNodeKey) {
        graphPanel.webview.postMessage({
          type: "focusNode",
          nodeKey: pendingFocusNodeKey,
        });
        pendingFocusNodeKey = null;
      }
      return;
    }

    const extensionUri = Uri.file(extensionPath);
    const panel = window.createWebviewPanel(
      "metabaseDependencyGraph",
      "Dependency Graph",
      ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [Uri.joinPath(extensionUri, "dist", "webview")],
      },
    );

    panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
    graphPanel = panel;

    panel.webview.onDidReceiveMessage(
      async (message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case "ready":
            await sendGraphDataToWebview(panel);
            break;
          case "openFile":
            if (message.filePath) {
              const fileUri = Uri.file(message.filePath);
              await window.showTextDocument(fileUri);
            }
            break;
        }
      },
    );

    panel.onDidDispose(() => {
      graphPanel = null;
    });
  }

  useCommand("metastudio.showDependencyGraph", () => showDependencyGraph());

  const CONTENT_KIND_TO_MODEL: Record<ContentNode["kind"], string> = {
    card: "Card",
    dashboard: "Dashboard",
    collection: "Collection",
    native_query_snippet: "NativeQuerySnippet",
    timeline: "Timeline",
    document: "Document",
    transform: "Transform",
    action: "Action",
  };

  function getGraphNodeKey(node: ContentNode | CatalogNode): string | null {
    if (node.kind === "table") {
      return `Table:${node.name}`;
    }
    if (node.kind === "measure" || node.kind === "segment") {
      return `${node.kind === "measure" ? "Measure" : "Segment"}:${node.entityId}`;
    }
    if (node.kind in CONTENT_KIND_TO_MODEL) {
      const contentNode = node as ContentNode;
      return `${CONTENT_KIND_TO_MODEL[contentNode.kind]}:${contentNode.entityId}`;
    }
    return null;
  }

  useCommand("metastudio.openInMetabase", (node: ContentNode) => {
    const host = config.host;
    if (!host) {
      window.showErrorMessage(
        'Metabase host is not configured. Set it in Settings under "metastudio.host".',
      );
      return;
    }

    let urlPath: string;
    switch (node.kind) {
      case "card":
        urlPath = `/question/entity/${node.entityId}`;
        break;
      case "dashboard":
        urlPath = `/dashboard/entity/${node.entityId}`;
        break;
      case "collection":
        urlPath = `/collection/entity/${node.entityId}`;
        break;
      default:
        return;
    }

    const url = `${host.replace(/\/+$/, "")}${urlPath}`;
    env.openExternal(Uri.parse(url));
  });

  useCommand(
    "metastudio.showInDependencyGraph",
    (node: ContentNode | CatalogNode) => {
      const nodeKey = getGraphNodeKey(node);
      if (nodeKey) {
        showDependencyGraph(nodeKey);
      }
    },
  );

  function generateNonce(): string {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  function buildTransformPreviewData(
    node: TransformNode,
  ): TransformPreviewData {
    return {
      name: node.name,
      description: node.description,
      query: parseTransformQuery(node.raw),
      target: parseTransformTarget(node.raw),
      filePath: node.filePath,
      entityId: node.entityId,
    };
  }

  async function handleTransformMessage(message: Record<string, unknown>) {
    switch (message.type) {
      case "openFile": {
        const filePath = message.filePath as string | undefined;
        if (filePath) {
          window.showTextDocument(Uri.file(filePath));
        }
        break;
      }
      case "openGraph": {
        const entityId = message.entityId as string | undefined;
        if (entityId) {
          await showDependencyGraph(`Transform:${entityId}`);
        } else {
          await showDependencyGraph();
        }
        break;
      }
      case "openTable": {
        const tableRef = message.ref as string[] | undefined;
        if (!tableRef || tableRef.length < 3 || !currentCatalog) break;
        const tableNode = currentCatalog.getTable(
          tableRef[0],
          tableRef[1],
          tableRef[2],
        );
        if (tableNode?.filePath) {
          window.showTextDocument(Uri.file(tableNode.filePath));
        }
        break;
      }
      case "openField": {
        const fieldRef = message.ref as string[] | undefined;
        if (!fieldRef || fieldRef.length < 4 || !currentCatalog) break;
        const table = currentCatalog.getTable(
          fieldRef[0],
          fieldRef[1],
          fieldRef[2],
        );
        const field = table?.fields.find(
          (fieldNode) => fieldNode.name === fieldRef[3],
        );
        if (field?.filePath) {
          window.showTextDocument(Uri.file(field.filePath));
        } else if (table?.filePath) {
          window.showTextDocument(Uri.file(table.filePath));
        }
        break;
      }
    }
  }

  useCommand("metastudio.showTransformPreview", (node: TransformNode) => {
    const data = buildTransformPreviewData(node);
    const nonce = generateNonce();
    const html = getTransformPreviewHtml(data, nonce);

    if (transformPanel) {
      transformPanel.title = node.name;
      transformPanel.webview.html = html;
      transformPanel.reveal(ViewColumn.One, true);
    } else {
      const panel = window.createWebviewPanel(
        "metabaseTransformPreview",
        node.name,
        { viewColumn: ViewColumn.One, preserveFocus: true },
        { enableScripts: true },
      );
      panel.webview.html = html;
      transformPanel = panel;

      panel.webview.onDidReceiveMessage(handleTransformMessage);

      panel.onDidDispose(() => {
        transformPanel = null;
      });
    }
  });

  useFileSystemWatcher("**/*.yaml", {
    onDidCreate: () => {
      loadExport();
      if (graphPanel) sendGraphDataToWebview(graphPanel);
    },
    onDidChange: () => {
      loadExport();
      if (graphPanel) sendGraphDataToWebview(graphPanel);
    },
    onDidDelete: () => {
      loadExport();
      if (graphPanel) sendGraphDataToWebview(graphPanel);
    },
  });
});

export { activate, deactivate };
