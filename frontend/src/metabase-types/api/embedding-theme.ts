import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

export interface EmbeddingTheme {
  id: number;
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
  id: number;
  name?: string;
  settings?: MetabaseTheme;
}
