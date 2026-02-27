import type { TransformQuery, TransformTarget } from "./transform-query";

export type GraphNodeModel =
  | "question"
  | "model"
  | "metric"
  | "table"
  | "dashboard"
  | "transform"
  | "collection"
  | "segment"
  | "measure"
  | "snippet"
  | "document"
  | "action"
  | "database"
  | "field";

export interface DependentsCount {
  question?: number;
  model?: number;
  metric?: number;
  table?: number;
  dashboard?: number;
  transform?: number;
  collection?: number;
  segment?: number;
  measure?: number;
  snippet?: number;
  document?: number;
}

export interface GraphViewField {
  name: string;
  semanticType: string | null;
}

export interface GraphViewNode {
  key: string;
  model: GraphNodeModel;
  name: string;
  description: string | null;
  filePath: string;
  cardType?: string;
  queryType?: string;
  display?: string;
  createdAt?: string | null;
  collectionId?: string | null;
  dependentsCount: DependentsCount;
  fields?: GraphViewField[];
  incomingCount: number;
  outgoingCount: number;
}

export interface GraphViewEdge {
  sourceKey: string;
  targetKey: string;
  referenceType: string;
}

export type ExtensionToWebviewMessage =
  | {
      type: "init";
      configExists: boolean;
      nodes: GraphViewNode[];
      edges: GraphViewEdge[];
      issueCount: number;
      cycleCount: number;
    }
  | {
      type: "configExistsChanged";
      configExists: boolean;
    }
  | {
      type: "themeChanged";
      colorMode: "light" | "dark";
    }
  | {
      type: "focusNode";
      nodeKey: string;
    };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openFile"; filePath: string }
  | { type: "selectNode"; key: string };

// -- Notebook view types --

export interface NotebookClauseData {
  displayName: string;
  fieldRef: string[] | null;
}

export interface NotebookStepData {
  type: string;
  title: string | null;
  clauses: NotebookClauseData[];
}

export interface NotebookMetadataField {
  id: number;
  table_id: number;
  name: string;
  display_name: string;
  base_type: string;
  semantic_type: string | null;
}

export interface NotebookMetadataTable {
  id: number;
  db_id: number;
  name: string;
  display_name: string;
  schema: string;
  fields: number[];
}

export interface NotebookMetadataDatabase {
  id: number;
  name: string;
  engine: string;
  features: string[];
}

export interface NotebookMetadata {
  databases: Record<number, NotebookMetadataDatabase>;
  tables: Record<number, NotebookMetadataTable>;
  fields: Record<number, NotebookMetadataField>;
}

export interface NotebookData {
  name: string;
  description: string | null;
  database: string | null;
  cardType: string | null;
  queryType: string | null;
  nativeSql: string | null;
  datasetQuery: Record<string, unknown> | null;
  metadata: NotebookMetadata | null;
  steps: NotebookStepData[] | null;
  target: { database: string; schema: string; name: string } | null;
  filePath: string;
  entityId: string;
}

export type ExtensionToNotebookMessage =
  | { type: "notebookInit"; data: NotebookData }
  | { type: "notebookUpdate"; data: NotebookData };

export type NotebookToExtensionMessage =
  | { type: "ready" }
  | { type: "openFile"; filePath: string }
  | { type: "openGraph"; entityId: string }
  | { type: "openTable"; ref: string[] }
  | { type: "openField"; ref: string[] }
  | { type: "runTransform" }
  | { type: "editInEditor"; filePath: string; lang: string; name: string };

// -- Transform preview types --

export type {
  TransformQuery,
  NativeTransformQuery,
  StructuredTransformQuery,
  TransformTarget,
  FieldReference,
  TableReference,
} from "./transform-query";

export interface TransformPreviewData {
  name: string;
  description: string | null;
  query: TransformQuery | null;
  target: TransformTarget | null;
  filePath: string;
  entityId: string;
  sourceQueryType: "native" | "query" | "python" | null;
  notebookData: NotebookData | null;
}

export interface CardPreviewData {
  name: string;
  description: string | null;
  database: string | null;
  cardType: string | null;
  filePath: string;
  entityId: string;
  notebookData: NotebookData;
}

export type PreviewData =
  | { kind: "transform"; data: TransformPreviewData }
  | { kind: "card"; data: CardPreviewData };

export type ExtensionToPreviewMessage =
  | { type: "previewInit"; data: PreviewData }
  | { type: "previewUpdate"; data: PreviewData };

export type PreviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openFile"; filePath: string }
  | { type: "openGraph"; entityId: string }
  | { type: "openTable"; ref: string[] }
  | { type: "openField"; ref: string[] }
  | { type: "runTransform" }
  | { type: "editInEditor"; filePath: string; lang: string; name: string };

// -- Table data viewer types --

export interface TableViewColumn {
  name: string;
  baseType: string;
}

export interface TableSchemaData {
  tableName: string;
  schema: string | null;
  columns: TableViewColumn[];
}

export interface TableViewData extends TableSchemaData {
  rows: unknown[][];
}

export type ExtensionToTableDataMessage =
  | { type: "tableSchemaInit"; data: TableSchemaData }
  | { type: "tableDataInit"; data: TableViewData }
  | { type: "tableDataLoading"; tableName: string }
  | { type: "tableDataError"; message: string };

export type TableDataToExtensionMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "loadData" };
