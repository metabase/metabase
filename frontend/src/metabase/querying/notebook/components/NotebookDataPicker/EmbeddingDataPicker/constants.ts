import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

/**
 * If we have more than this number of models, show only
 * the models in the data picker.
 */
export const HIDE_TABLES_IF_MORE_THAN_N_MODELS = 2;

/**
 * If we have less than this number of entities, use the simple data picker.
 */
export const USE_SIMPLE_DATA_PICKER_IF_LESS_THAN_N_ITEMS = 100;

/** What types of entities are allowed in the simple data picker */
export const ALLOWED_SIMPLE_DATA_PICKER_ENTITY_TYPES: EmbeddingEntityType[] = [
  "model",
  "table",
];
