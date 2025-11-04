import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

export type EmbeddingThemeId = number;

export interface EmbeddingTheme {
  id: EmbeddingThemeId;
  name: string;
  settings: MetabaseTheme;
  created_at: string;
  updated_at: string;
}

export interface CreateEmbeddingThemeRequest {
  name: string;
  settings: MetabaseTheme;
}

export interface UpdateEmbeddingThemeRequest {
  id: EmbeddingThemeId;
  name?: string;
  settings?: MetabaseTheme;
}
