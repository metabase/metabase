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

export interface MetricLockEntry {
  sourceMetricId: number;
  copiedMetricId: number;
  hash: string;
}

export interface ResourceLockfile {
  /** Where the copies were last synchronized, so a moved app reads apart from a moved copy. */
  collectionId?: number;
  queries: QueryLockEntry[];
  actions: ActionLockEntry[];
  metrics: MetricLockEntry[];
}

export interface DataAppMetric extends MetabaseCard {
  type: "metric";
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

export interface MetabaseCard {
  id: number;
  name: string;
  type: string;
  collection_id: number | null;
  archived?: boolean;
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
  model_id: number | null;
  collection_id?: number | null;
  archived?: boolean;
  description?: string | null;
  parameters?: unknown[] | null;
  parameter_mappings?: Record<string, unknown> | null;
  visualization_settings?: Record<string, unknown> | null;
  dataset_query?: Record<string, unknown> | null;
  database_id?: number | null;
}
