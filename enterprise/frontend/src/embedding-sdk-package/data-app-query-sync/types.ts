export interface QueryLockEntry {
  tableId: number;
  hash: string;
  savedQuestionSourceId: number;
}

export interface DiscoveredQuery {
  exportName: string;
  filePath: string;
  query: Record<string, unknown>;
  savedQuestionSourceId?: number;
  tableId: number;
  hash: string;
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
}
