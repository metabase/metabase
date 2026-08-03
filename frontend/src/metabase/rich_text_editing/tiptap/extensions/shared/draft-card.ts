import type {
  Card,
  DatabaseId,
  DatasetQuery,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

export function buildDraftCard(card: {
  id: number;
  name: string;
  display: VisualizationDisplay;
  dataset_query: DatasetQuery;
  visualization_settings: VisualizationSettings;
  description?: string | null;
  database_id?: DatabaseId;
}): Card {
  return {
    // BaseEntityId is branded; drafts use a placeholder that never reaches the API
    entity_id: "" as Card["entity_id"],
    created_at: "",
    updated_at: "",
    type: "question",
    public_uuid: null,
    enable_embedding: false,
    embedding_params: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
    can_manage_db: false,
    initially_published_at: null,
    collection_id: null,
    collection_position: null,
    dashboard: null,
    dashboard_id: null,
    dashboard_count: null,
    result_metadata: [],
    last_query_start: null,
    average_query_time: null,
    cache_ttl: null,
    archived: false,
    ...card,
    description: card.description ?? null,
  };
}
