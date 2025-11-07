import { createContext, useContext } from "react";

import type {
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";

export interface EmbeddingThemeEditorContextValue {
  id: number;
  name: string;

  // Use the actual object to keep them in sync.
  theme: MetabaseTheme;

  // Whether the theme has unsaved changes
  isDirty: boolean;

  // Update theme name
  setName: (name: string) => void;

  // Update specific color value
  setColor: (colorKey: keyof MetabaseColors, value: string) => void;

  // Update any theme value
  setThemeValue: <K extends keyof MetabaseTheme>(
    key: K,
    value: MetabaseTheme[K],
  ) => void;

  // Reset colors to default
  resetColors: () => void;

  // Save the theme
  saveTheme: () => Promise<void>;

  // Whether the theme is currently being saved
  isSaving: boolean;
}

export const EmbeddingThemeEditorContext =
  createContext<EmbeddingThemeEditorContextValue | null>(null);

export const useEmbeddingThemeEditor = () => {
  const context = useContext(EmbeddingThemeEditorContext);

  if (!context) {
    throw new Error(
      "useEmbeddingThemeEditor must be used within an EmbeddingThemeEditorProvider",
    );
  }

  return context;
};
