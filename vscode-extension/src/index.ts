import type {PanelState} from "./extension-context"

import {ref, watch} from "@reactive-vscode/reactivity"
import {
  defineExtension,
  useExtensionSecret,
  useWorkspaceFolders,
  useWorkspaceState,
} from "reactive-vscode"
import {languages, window} from "vscode"

import {CatalogTreeProvider} from "./catalog-tree-provider"
import {registerConnectionCommands} from "./commands/connection"
import {registerDependencyGraphCommands} from "./commands/dependency-graph"
import {registerOpenInMetabaseCommand} from "./commands/open-in-metabase"
import {registerRunTransformCommand} from "./commands/run-transform"
import {registerTransformPreviewCommand} from "./commands/transform-preview"
import {config} from "./config"
import {ConnectionTreeProvider} from "./connection-tree-provider"
import {ContentTreeProvider} from "./content-tree-provider"
import {registerExportLoader} from "./export-loader"
import {setOutputChannel} from "./metabase-client"
import {WorkspaceManager} from "./workspace-manager"

const outputChannel = window.createOutputChannel("Metastudio")

const {activate, deactivate} = defineExtension((context) => {
  outputChannel.appendLine("Metastudio extension activating...")
  setOutputChannel(outputChannel)

  const extensionPath = context.extensionPath
  const apiKey = useExtensionSecret("apiKey")
  const workspacesSecret = useExtensionSecret("workspaces")
  const workspaceFolders = useWorkspaceFolders()
  const configExists = ref(false)

  const connectionProvider = new ConnectionTreeProvider(
    () => config.host ?? "",
    () => !!apiKey.value,
  )
  const catalogProvider = new CatalogTreeProvider(extensionPath)
  const contentProvider = new ContentTreeProvider(extensionPath)

  const metastudioId = useWorkspaceState<string>("metastudio.id", "")
  if (!metastudioId.value) {
    metastudioId.value = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).padStart(2, "0").slice(0, 2))
      .join("")
      .slice(0, 8)
    outputChannel.appendLine(`Generated metastudioId: ${metastudioId.value}`)
  }
  outputChannel.appendLine(`metastudioId: ${metastudioId.value}`)

  const workspaceManager = new WorkspaceManager(workspacesSecret, outputChannel)

  // Migrate: clean up old single-workspace storage
  const oldWorkspaceState = useWorkspaceState("metabase.workspace", undefined)
  const oldWorkspaceApiKey = useExtensionSecret("workspaceApiKey")
  if (oldWorkspaceState.value !== undefined) {
    oldWorkspaceState.value = undefined
    outputChannel.appendLine("Migrated: cleared old metabase.workspace state")
  }
  watch(() => oldWorkspaceApiKey.value, (value) => {
    if (value === null) return // still loading
    if (value !== undefined) {
      oldWorkspaceApiKey.remove()
      outputChannel.appendLine("Migrated: removed old workspaceApiKey secret")
    }
  }, {immediate: true})

  window.registerTreeDataProvider("metabase.connection", connectionProvider)
  window.registerTreeDataProvider("metabase.dataCatalog", catalogProvider)
  window.registerTreeDataProvider("metabase.content", contentProvider)

  const diagnosticCollection = languages.createDiagnosticCollection(
    "metabase-dependencies",
  )
  context.subscriptions.push(diagnosticCollection)

  const panels: PanelState = {
    graphPanel: null,
    transformPanel: null,
    currentCatalog: null,
    pendingFocusNodeKey: null,
    currentTransformNode: null,
  }

  const ctx = {
    apiKey,
    configExists,
    workspaceFolders,
    extensionPath,
    metastudioId,
    connectionProvider,
    catalogProvider,
    contentProvider,
    outputChannel,
    diagnosticCollection,
    workspaceManager,
    panels,
  }

  registerConnectionCommands(ctx)
  registerExportLoader(ctx)
  registerRunTransformCommand(ctx)
  registerDependencyGraphCommands(ctx)
  registerTransformPreviewCommand(ctx)
  registerOpenInMetabaseCommand()
})

export {activate, deactivate}
