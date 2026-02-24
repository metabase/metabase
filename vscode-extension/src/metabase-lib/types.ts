// Composite reference types used throughout the serialization format
// Schema (index 1) can be null when the database has no schema concept
// FieldRef supports hierarchical fields: [db, schema, table, field1, field2, ...]
export type TableRef = readonly [database: string, schema: string | null, table: string]
export type FieldRef = readonly [database: string, schema: string | null, table: string, field: string, ...parentFields: string[]]

// === Catalog Node Types (Database > Schema > Table > Field/Measure/Segment) ===

export interface DatabaseNode {
  kind: 'database'
  name: string
  engine: string | null
  description: string | null
  schemas: SchemaNode[]
  filePath: string | null
  raw: Record<string, unknown> | null
}

export interface SchemaNode {
  kind: 'schema'
  name: string
  databaseName: string
  tables: TableNode[]
}

export interface TableNode {
  kind: 'table'
  name: string
  displayName: string
  description: string | null
  databaseName: string
  schemaName: string
  entityType: string | null
  active: boolean
  collectionId: string | null
  transformId: string | null
  fields: FieldNode[]
  measures: MeasureNode[]
  segments: SegmentNode[]
  filePath: string
  raw: Record<string, unknown>
}

export interface FieldNode {
  kind: 'field'
  name: string
  displayName: string
  description: string | null
  databaseName: string
  schemaName: string
  tableName: string
  databaseType: string
  baseType: string
  effectiveType: string
  semanticType: string | null
  fkTargetFieldRef: FieldRef | null
  position: number
  active: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface MeasureNode {
  kind: 'measure'
  entityId: string
  name: string
  description: string | null
  databaseName: string
  schemaName: string
  tableName: string
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface SegmentNode {
  kind: 'segment'
  entityId: string
  name: string
  description: string | null
  databaseName: string
  schemaName: string
  tableName: string
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

// === Content Node Types ===

export interface CollectionNode {
  kind: 'collection'
  entityId: string
  name: string
  description: string | null
  collectionType: string | null
  parentId: string | null
  archived: boolean
  children: CollectionNode[]
  cards: CardNode[]
  dashboards: DashboardNode[]
  snippets: NativeQuerySnippetNode[]
  timelines: TimelineNode[]
  documents: DocumentNode[]
  filePath: string
  raw: Record<string, unknown>
}

export interface CardNode {
  kind: 'card'
  entityId: string
  name: string
  description: string | null
  display: string
  queryType: string
  cardType: string
  collectionId: string | null
  databaseId: string | null
  tableRef: TableRef | null
  sourceCardId: string | null
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface DashboardNode {
  kind: 'dashboard'
  entityId: string
  name: string
  description: string | null
  collectionId: string | null
  archived: boolean
  tabs: DashboardTabNode[]
  dashcards: DashboardCardNode[]
  filePath: string
  raw: Record<string, unknown>
}

export interface DashboardTabNode {
  kind: 'dashboard_tab'
  entityId: string
  name: string
  position: number
}

export interface DashboardCardNode {
  kind: 'dashboard_card'
  entityId: string
  cardId: string | null
  actionId: string | null
  dashboardTabId: string | null
  row: number
  col: number
  sizeX: number
  sizeY: number
}

export interface NativeQuerySnippetNode {
  kind: 'native_query_snippet'
  entityId: string
  name: string
  description: string | null
  content: string
  collectionId: string | null
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface TimelineNode {
  kind: 'timeline'
  entityId: string
  name: string
  description: string | null
  icon: string | null
  collectionId: string | null
  archived: boolean
  events: TimelineEventNode[]
  filePath: string
  raw: Record<string, unknown>
}

export interface TimelineEventNode {
  kind: 'timeline_event'
  name: string
  description: string | null
  icon: string | null
  timestamp: string | null
  archived: boolean
}

export interface ActionNode {
  kind: 'action'
  entityId: string
  name: string
  description: string | null
  type: string
  modelId: string | null
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface DocumentNode {
  kind: 'document'
  entityId: string
  name: string
  description: string | null
  contentType: string | null
  collectionId: string | null
  archived: boolean
  filePath: string
  raw: Record<string, unknown>
}

export interface TransformNode {
  kind: 'transform'
  entityId: string
  name: string
  description: string | null
  sourceDatabaseId: string | null
  collectionId: string | null
  filePath: string
  raw: Record<string, unknown>
}

// === Union Types ===

export type CatalogNode = DatabaseNode | SchemaNode | TableNode | FieldNode | MeasureNode | SegmentNode
export type ContentNode =
  | CollectionNode
  | CardNode
  | DashboardNode
  | NativeQuerySnippetNode
  | TimelineNode
  | ActionNode
  | DocumentNode
  | TransformNode
export type GraphNode = CatalogNode | ContentNode

// === Consistency Validation ===

export type IssueSeverity = 'error' | 'warning'

export interface ConsistencyIssue {
  severity: IssueSeverity
  message: string
  filePath: string
  entityKind: GraphNode['kind']
  referenceType: string
  reference: string
}
