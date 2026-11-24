import { dayjs } from "metabase/dayjs";
import type { SearchResult } from "metabase-types/api";

type SampleSearchResult = Pick<SearchResult, "name" | "model"> & {
  collectionName: string;
  description?: string;
};

// Typical names, collections and models, so a first visit's skeleton has
// realistic line lengths. Later visits draw the results as last shown.
const SAMPLE_ROWS: SampleSearchResult[] = [
  {
    name: "Revenue by product category",
    model: "card",
    collectionName: "Finance",
  },
  {
    name: "Sales performance overview",
    model: "dashboard",
    collectionName: "Sales",
    description: "Pipeline, bookings and win rates for the current quarter",
  },
  {
    name: "Customer accounts",
    model: "dataset",
    collectionName: "Customer success",
  },
  {
    name: "Weekly active users",
    model: "metric",
    collectionName: "Product analytics",
  },
  {
    name: "Orders by region and month",
    model: "card",
    collectionName: "Operations",
  },
  {
    name: "Marketing campaign results",
    model: "dashboard",
    collectionName: "Marketing",
  },
  {
    name: "Monthly recurring revenue",
    model: "metric",
    collectionName: "Finance",
  },
  {
    name: "Support tickets by priority",
    model: "card",
    collectionName: "Customer success",
  },
];

export const SAMPLE_SEARCH_RESULTS: SearchResult[] = SAMPLE_ROWS.map(
  ({ name, model, collectionName, description }, index) => {
    const id = -(index + 1);
    const createdAt = dayjs()
      .subtract(index + 30, "day")
      .toISOString();
    const editedAt = dayjs()
      .subtract(index + 2, "day")
      .toISOString();

    return {
      id,
      name,
      model,
      description: description ?? null,
      archived: false,
      collection_position: null,
      collection: { id, name: collectionName },
      table_id: id,
      bookmark: null,
      dashboard: null,
      database_id: id,
      database_name: null,
      display: null,
      pk_ref: null,
      table_schema: null,
      collection_authority_level: null,
      updated_at: editedAt,
      moderated_status: null,
      model_id: null,
      model_name: null,
      model_index_id: null,
      table_description: null,
      table_name: null,
      table_display_name: null,
      initial_sync_status: null,
      dashboard_count: null,
      context: null,
      last_edited_at: editedAt,
      last_editor_id: null,
      last_editor_common_name: null,
      creator_id: null,
      creator_common_name: null,
      created_at: createdAt,
      can_write: false,
    };
  },
);
