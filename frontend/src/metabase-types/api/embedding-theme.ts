import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

export type ColorHarmonyMode = "off" | "octagonal" | "square";

export interface EmbeddingTheme {
  id: number;
  name: string;
  settings: MetabaseTheme;
  color_harmony: ColorHarmonyMode;
  created_at: string;
  updated_at: string;
}

export interface CreateEmbeddingThemeRequest {
  name: string;
  settings: MetabaseTheme;
  color_harmony?: ColorHarmonyMode;
}

export interface UpdateEmbeddingThemeRequest {
  id: number;
  name?: string;
  settings?: MetabaseTheme;
  color_harmony?: ColorHarmonyMode;
}

export interface SeedDefaultEmbeddingThemesRequest {
  themes: CreateEmbeddingThemeRequest[];
}
