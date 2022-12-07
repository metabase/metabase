/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

export type Snippet = {
  id?: number;
  archived?: boolean;
  name?: string;
  description?: string;
  content?: string;
  database_id?: number;
};
