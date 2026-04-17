import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import { useDefaultEmbeddingThemeSettings } from "metabase/admin/embedding/hooks/use-default-embedding-theme-settings";
import {
  useGetEmbeddingThemeQuery,
  useUpdateEmbeddingThemeMutation,
} from "metabase/api/embedding-theme";
import { useToast } from "metabase/common/hooks";
import type {
  MetabaseColor,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";

interface ThemeEditorState {
  name: string;
  settings: MetabaseTheme;
}

/** Color keys that belong to the "additional colors" section. */
const ADDITIONAL_COLOR_KEYS: Exclude<MetabaseColor, "charts">[] = [
  "text-secondary",
  "text-tertiary",
  "border",
  "background-secondary",
  "filter",
  "summarize",
  "positive",
  "negative",
  "shadow",
];

const PRIMARY_COLORS_KEYS: Exclude<MetabaseColor, "charts">[] = [
  "brand",
  "background",
  "text-primary",
];

export function useEmbeddingThemeEditor(themeId: number) {
  const {
    data: serverTheme,
    isLoading,
    isError,
  } = useGetEmbeddingThemeQuery(themeId);
  const [updateTheme] = useUpdateEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const defaultThemeSettings = useDefaultEmbeddingThemeSettings();

  const [currentTheme, setCurrentTheme] = useState<ThemeEditorState | null>(
    null,
  );

  // Initialize state when server data arrives
  useEffect(() => {
    if (serverTheme && !currentTheme) {
      setCurrentTheme({
        name: serverTheme.name,
        settings: serverTheme.settings,
      });
    }
  }, [serverTheme, currentTheme]);

  const serverThemeState = useMemo(
    () =>
      serverTheme
        ? { name: serverTheme.name, settings: serverTheme.settings }
        : null,
    [serverTheme],
  );

  const isDirty = useMemo(
    () => !isEqual(serverThemeState, currentTheme),
    [serverThemeState, currentTheme],
  );

  const updateSettings = useCallback(
    (updater: (settings: MetabaseTheme) => Partial<MetabaseTheme>) => {
      setCurrentTheme((prev) =>
        prev
          ? {
              ...prev,
              settings: { ...prev.settings, ...updater(prev.settings) },
            }
          : prev,
      );
    },
    [],
  );

  const setName = useCallback((name: string) => {
    setCurrentTheme((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  const setColor = useCallback(
    (key: Exclude<MetabaseColor, "charts">, value: string) => {
      updateSettings((s) => ({
        colors: { ...s.colors, [key]: value.toLowerCase() },
      }));
    },
    [updateSettings],
  );

  const setChartColor = useCallback(
    (index: number, value: string) => {
      updateSettings((s) => {
        const charts = [...(s.colors?.charts ?? [])];
        charts[index] = value.toLowerCase();
        return { colors: { ...s.colors, charts } };
      });
    },
    [updateSettings],
  );

  const setFontFamily = useCallback(
    (family: string) => {
      updateSettings(() => ({ fontFamily: family }));
    },
    [updateSettings],
  );

  const setFontSize = useCallback(
    (size: string) => {
      updateSettings(() => ({ fontSize: size }));
    },
    [updateSettings],
  );

  const hasAdditionalColorChanges = useMemo(() => {
    if (!currentTheme) {
      return false;
    }

    const colors = currentTheme.settings.colors ?? {};
    const defaultColors = defaultThemeSettings.colors ?? {};

    for (const key of ADDITIONAL_COLOR_KEYS) {
      if ((colors[key] ?? "") !== ((defaultColors[key] as string) ?? "")) {
        return true;
      }
    }

    return !isEqual(colors.charts ?? [], defaultColors.charts ?? []);
  }, [currentTheme, defaultThemeSettings]);

  const hasMainColorChanges = useMemo(() => {
    if (!currentTheme) {
      return false;
    }

    const colors = currentTheme.settings.colors ?? {};
    const defaultColors = defaultThemeSettings.colors ?? {};

    for (const key of PRIMARY_COLORS_KEYS) {
      if ((colors[key] ?? "") !== ((defaultColors[key] as string) ?? "")) {
        return true;
      }
    }

    return !isEqual(colors.charts ?? [], defaultColors.charts ?? []);
  }, [currentTheme, defaultThemeSettings]);

  const resetAdditionalColors = useCallback(() => {
    updateSettings((s) => {
      const defaultColors = defaultThemeSettings.colors ?? {};
      const updatedColors = { ...s.colors };

      for (const key of ADDITIONAL_COLOR_KEYS) {
        updatedColors[key] = (defaultColors[key] as string) ?? "";
      }

      updatedColors.charts = defaultColors.charts ?? [];

      return { colors: updatedColors };
    });
  }, [updateSettings, defaultThemeSettings]);

  const resetMainColors = useCallback(() => {
    updateSettings((s) => {
      const defaultColors = defaultThemeSettings.colors ?? {};
      const updatedColors = { ...s.colors };

      for (const key of PRIMARY_COLORS_KEYS) {
        updatedColors[key] = (defaultColors[key] as string) ?? "";
      }

      return { colors: updatedColors };
    });
  }, [updateSettings, defaultThemeSettings]);

  const handleSave = useCallback(async () => {
    if (!currentTheme) {
      return;
    }
    try {
      await updateTheme({
        id: themeId,
        name: currentTheme.name,
        settings: currentTheme.settings,
      }).unwrap();
      sendToast({ message: t`Theme saved`, icon: "check" });
    } catch (error) {
      console.error("Failed to save theme:", error);
      sendToast({ message: t`Failed to save theme`, icon: "warning" });
    }
  }, [currentTheme, themeId, updateTheme, sendToast]);

  const handleDiscard = useCallback(() => {
    setCurrentTheme(serverThemeState);
  }, [serverThemeState]);

  return {
    isLoading,
    isNotFound: isError,
    currentTheme,
    isDirty,
    setName,
    setColor,
    setChartColor,
    hasMainColorChanges,
    resetMainColors,
    hasAdditionalColorChanges,
    resetAdditionalColors,
    setFontFamily,
    setFontSize,
    handleSave,
    handleDiscard,
  };
}

export type EmbeddingThemeEditorResult = ReturnType<
  typeof useEmbeddingThemeEditor
>;
