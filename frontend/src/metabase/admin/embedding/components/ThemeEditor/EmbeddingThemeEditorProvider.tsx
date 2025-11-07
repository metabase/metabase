import { useCallback, useEffect, useMemo, useState } from "react";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import {
  useGetEmbeddingThemeQuery,
  useUpdateEmbeddingThemeMutation,
} from "metabase/api/embedding-theme";

import { useDefaultEmbeddingThemeSettings } from "../../hooks/use-default-embedding-theme-settings";

import { EmbeddingThemeEditorContext } from "./context";

interface EmbeddingThemeEditorProviderProps {
  themeId: number;
  children: React.ReactNode;
}

export const EmbeddingThemeEditorProvider = ({
  themeId,
  children,
}: EmbeddingThemeEditorProviderProps) => {
  const { data: embeddingTheme, isLoading } =
    useGetEmbeddingThemeQuery(themeId);
  const [updateTheme, { isLoading: isSaving }] =
    useUpdateEmbeddingThemeMutation();
  const defaultTheme = useDefaultEmbeddingThemeSettings();

  // Local theme state for editing
  const [theme, setTheme] = useState<MetabaseTheme>(defaultTheme);
  const [originalTheme, setOriginalTheme] =
    useState<MetabaseTheme>(defaultTheme);
  const [name, setNameState] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // Initialize theme when loaded
  useEffect(() => {
    if (embeddingTheme?.settings) {
      const themeSettings = embeddingTheme.settings as MetabaseTheme;
      setTheme(themeSettings);
      setOriginalTheme(themeSettings);
      setNameState(embeddingTheme.name);
      setOriginalName(embeddingTheme.name);
      setIsDirty(false);
    }
  }, [embeddingTheme]);

  const setName = useCallback((newName: string) => {
    setNameState(newName);
    setIsDirty(true);
  }, []);

  const setColor = useCallback((colorKey: string, value: string) => {
    setTheme((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorKey]: value,
      },
    }));
    setIsDirty(true);
  }, []);

  const setThemeValue = useCallback(
    <K extends keyof MetabaseTheme>(key: K, value: MetabaseTheme[K]) => {
      setTheme((prev) => ({
        ...prev,
        [key]: value,
      }));
      setIsDirty(true);
    },
    [],
  );

  const resetColors = useCallback(() => {
    setTheme((prev) => ({
      ...prev,
      colors: defaultTheme.colors,
    }));
    setIsDirty(true);
  }, [defaultTheme]);

  const saveTheme = useCallback(async () => {
    if (!embeddingTheme) {
      return;
    }

    await updateTheme({
      id: embeddingTheme.id,
      name,
      settings: theme,
    }).unwrap();

    setOriginalTheme(theme);
    setOriginalName(name);
    setIsDirty(false);
  }, [embeddingTheme, name, theme, updateTheme]);

  const contextValue = useMemo(
    () => ({
      id: themeId,
      name,
      theme,
      isDirty,
      setName,
      setColor,
      setThemeValue,
      resetColors,
      saveTheme,
      isSaving,
    }),
    [
      themeId,
      name,
      theme,
      isDirty,
      setName,
      setColor,
      setThemeValue,
      resetColors,
      saveTheme,
      isSaving,
    ],
  );

  if (isLoading || !embeddingTheme) {
    return null;
  }

  return (
    <EmbeddingThemeEditorContext.Provider value={contextValue}>
      {children}
    </EmbeddingThemeEditorContext.Provider>
  );
};
