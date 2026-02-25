import type {DiagnosticCollection, OutputChannel, WebviewPanel, WorkspaceFolder} from "vscode"
import type {Ref} from "@reactive-vscode/reactivity"
import type {CatalogGraph, CardNode, TransformNode} from "./metabase-lib"
import type {CatalogTreeProvider} from "./catalog-tree-provider"
import type {ConnectionTreeProvider} from "./connection-tree-provider"
import type {ContentTreeProvider} from "./content-tree-provider"
import type {WorkspaceManager} from "./workspace-manager"

export interface ExtensionCtx {
  readonly apiKey: {
    readonly value: string | null | undefined
    set(v: string): Promise<void>
    remove(): Promise<void>
  }
  readonly configExists: Ref<boolean>
  readonly workspaceFolders: Readonly<Ref<readonly WorkspaceFolder[] | undefined>>
  readonly extensionPath: string
  readonly metastudioId: Ref<string>
  readonly connectionProvider: ConnectionTreeProvider
  readonly catalogProvider: CatalogTreeProvider
  readonly contentProvider: ContentTreeProvider
  readonly outputChannel: OutputChannel
  readonly diagnosticCollection: DiagnosticCollection
  readonly workspaceManager: WorkspaceManager
  readonly panels: PanelState
}

export interface PanelState {
  graphPanel: WebviewPanel | null
  transformPanel: WebviewPanel | null
  notebookPanel: WebviewPanel | null
  currentCatalog: CatalogGraph | null
  pendingFocusNodeKey: string | null
  currentTransformNode: CardNode | TransformNode | null
  currentNotebookNode: CardNode | TransformNode | null
}
