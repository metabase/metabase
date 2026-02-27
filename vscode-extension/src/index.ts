import type { PanelState } from './extension-context'

import { ref, watch } from '@reactive-vscode/reactivity'
import {
  defineExtension,
  useCommand,
  useExtensionSecret,
  useWorkspaceFolders,
  useWorkspaceState,
} from 'reactive-vscode'
import { languages, Uri, ViewColumn, window, workspace } from 'vscode'

import { CatalogTreeProvider } from './catalog-tree-provider'
import { registerConnectionCommands } from './commands/connection'
import { registerCreateTransformCommand } from './commands/create-transform'
import { registerDependencyGraphCommands } from './commands/dependency-graph'
import { registerNotebookViewCommand } from './commands/notebook-view'
import { registerOpenInMetabaseCommand } from './commands/open-in-metabase'
import { registerRunTransformCommand } from './commands/run-transform'
import { registerTransformPreviewCommand } from './commands/transform-preview'
import { registerViewTableDataCommand } from './commands/view-table-data'
import { config } from './config'
import { ConnectionTreeProvider } from './connection-tree-provider'
import { ContentTreeProvider } from './content-tree-provider'
import { EmbeddedCodeProvider } from './embedded-code-provider'
import { registerExportLoader } from './export-loader'
import { registerLmTools } from './lm-tools'
import { setOutputChannel } from './metabase-client'
import { WorkspaceDataTreeProvider } from './workspace-data-tree-provider'
import { WorkspaceManager } from './workspace-manager'

const outputChannel = window.createOutputChannel('Metastudio')

const { activate, deactivate } = defineExtension((context) => {
  outputChannel.appendLine('Metastudio extension activating...')
  setOutputChannel(outputChannel)

  const extensionPath = context.extensionPath
  const apiKey = useExtensionSecret('apiKey')
  const workspacesSecret = useExtensionSecret('workspaces')
  const workspaceFolders = useWorkspaceFolders()
  const configExists = ref(false)

  const connectionProvider = new ConnectionTreeProvider(
    () => config.host ?? '',
    () => !!apiKey.value,
  )
  const catalogProvider = new CatalogTreeProvider(extensionPath)
  const contentProvider = new ContentTreeProvider(extensionPath)
  const workspaceDataProvider = new WorkspaceDataTreeProvider(extensionPath, outputChannel)

  const metastudioId = useWorkspaceState<string>('metastudio.id', '')
  if (!metastudioId.value) {
    metastudioId.value = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).padStart(2, '0').slice(0, 2))
      .join('')
      .slice(0, 8)
    outputChannel.appendLine(`Generated metastudioId: ${metastudioId.value}`)
  }
  outputChannel.appendLine(`metastudioId: ${metastudioId.value}`)

  const workspaceManager = new WorkspaceManager(workspacesSecret, outputChannel)

  // Migrate: clean up old single-workspace storage
  const oldWorkspaceState = useWorkspaceState('metabase.workspace', undefined)
  const oldWorkspaceApiKey = useExtensionSecret('workspaceApiKey')
  if (oldWorkspaceState.value !== undefined) {
    oldWorkspaceState.value = undefined
    outputChannel.appendLine('Migrated: cleared old metabase.workspace state')
  }
  watch(() => oldWorkspaceApiKey.value, (value) => {
    if (value === null)
      return // still loading
    if (value !== undefined) {
      oldWorkspaceApiKey.remove()
      outputChannel.appendLine('Migrated: removed old workspaceApiKey secret')
    }
  }, { immediate: true })

  window.registerTreeDataProvider('metabase.connection', connectionProvider)
  window.registerTreeDataProvider('metabase.dataCatalog', catalogProvider)
  window.registerTreeDataProvider('metabase.content', contentProvider)
  window.registerTreeDataProvider('metabase.workspaceData', workspaceDataProvider)

  // Refresh workspace data when credentials are available.
  // Watch both secrets: value===null means still loading, so skip until both have resolved.
  watch(
    () => [apiKey.value, workspacesSecret.value] as const,
    ([key, wsSecret]) => {
      if (key === null || wsSecret === null) return // still loading from secure storage
      if (key && config.host) {
        workspaceDataProvider.setContext(config.host, key, workspaceManager)
        workspaceDataProvider.refresh().catch((err: unknown) => {
          outputChannel.appendLine(`workspaceData refresh error: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    },
    { immediate: true },
  )

  const diagnosticCollection = languages.createDiagnosticCollection(
    'metabase-dependencies',
  )
  context.subscriptions.push(diagnosticCollection)

  const panels: PanelState = {
    graphPanel: null,
    transformPanel: null,
    notebookPanel: null,
    tableDataPanel: null,
    currentCatalog: null,
    pendingFocusNodeKey: null,
    currentTransformNode: null,
    currentNotebookNode: null,
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
    workspaceDataProvider,
    outputChannel,
    diagnosticCollection,
    workspaceManager,
    panels,
  }

  const embeddedProvider = new EmbeddedCodeProvider()
  context.subscriptions.push(
    workspace.registerFileSystemProvider('metastudio-embedded', embeddedProvider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  )

  useCommand('metastudio.openEmbeddedCode', async (args: { filePath: string, lang: string, name: string }) => {
    const ext = args.lang === 'python' ? '.py' : '.sql'
    const uri = Uri.from({
      scheme: 'metastudio-embedded',
      path: `/${args.name}${ext}`,
      query: `yaml=${encodeURIComponent(args.filePath)}&lang=${args.lang}`,
    })
    const doc = await workspace.openTextDocument(uri)
    await window.showTextDocument(doc, { viewColumn: ViewColumn.Beside })
  })

  useCommand('metastudio.refreshWorkspaceData', () => {
    const key = apiKey.value
    if (key && config.host) {
      workspaceDataProvider.setContext(config.host, key, workspaceManager)
      workspaceDataProvider.refresh().catch((err: unknown) => {
        outputChannel.appendLine(`workspaceData refresh error: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  })

  registerConnectionCommands(ctx)
  registerCreateTransformCommand(ctx)
  registerExportLoader(ctx)
  registerRunTransformCommand(ctx)
  registerDependencyGraphCommands(ctx)
  registerTransformPreviewCommand(ctx)
  registerNotebookViewCommand(ctx)
  registerOpenInMetabaseCommand()
  registerViewTableDataCommand(ctx)
  registerLmTools(ctx, context)
})

export { activate, deactivate }
