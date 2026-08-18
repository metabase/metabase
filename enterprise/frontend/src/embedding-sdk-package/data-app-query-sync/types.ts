export interface QueryLockEntry {
  tableId: number;
  hash: string;
  savedQuestionSourceId: number;
}

export interface ActionLockEntry {
  sourceActionId: number;
  copiedActionId: number;
  hash: string;
}

/**
 * A model copied into the data app collection. `actions` is both the
 * reference count that keeps the copy alive and the mapping the app's
 * definitions address.
 */
export interface ModelLockEntry {
  sourceModelId: number;
  copiedModelId: number;
  hash: string;
  actions: ActionLockEntry[];
}

export interface ResourceLockfile {
  /** Where the copies were last synchronized, so a moved app reads apart from a moved copy. */
  collectionId?: number;
  queries: QueryLockEntry[];
  models: ModelLockEntry[];
}

export interface DiscoveredQuery {
  exportName: string;
  filePath: string;
  query: Record<string, unknown>;
  savedQuestionSourceId?: number;
  tableId: number;
  hash: string;
}

export interface DiscoveredAction {
  exportName: string;
  filePath: string;
  copiedActionId?: number;
  sourceActionId: number;
}

export interface DataAppMetadata {
  name: string;
  resource_collection_id: number;
}

export interface DraftDataAppMetadata extends DataAppMetadata {
  resource_collection_entity_id: string;
  permission_group_entity_id: string;
}

export interface MetabaseCard {
  id: number;
  name: string;
  type: string;
  collection_id: number | null;
  dataset_query: Record<string, unknown>;
  database_id?: number | null;
  display?: string | null;
  visualization_settings?: Record<string, unknown> | null;
  description?: string | null;
}

export interface MetabaseAction {
  id: number;
  name: string;
  type: string;
  model_id: number;
  archived?: boolean;
  description?: string | null;
  parameters?: unknown[] | null;
  parameter_mappings?: Record<string, unknown> | null;
  visualization_settings?: Record<string, unknown> | null;
  /** Present on implicit actions. */
  kind?: string | null;
  /** Present on query actions. */
  dataset_query?: Record<string, unknown> | null;
  /** Present on query actions. */
  database_id?: number | null;
}
