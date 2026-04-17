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

  const setName = useCallback((name: string) => {
    setCurrentTheme((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  const setColor = useCallback(
    (key: Exclude<MetabaseColor, "charts">, value: string) => {
      setCurrentTheme((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          settings: {
            ...prev.settings,
            colors: { ...prev.settings.colors, [key]: value.toLowerCase() },
          },
        };
      });
    },
    [],
  );

  const setChartColor = useCallback((index: number, value: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const charts = [...(prev.settings.colors?.charts ?? [])];
      charts[index] = value.toLowerCase();
      return {
        ...prev,
        settings: {
          ...prev.settings,
          colors: { ...prev.settings.colors, charts },
        },
      };
    });
  }, []);

  const setFontFamily = useCallback((family: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        settings: { ...prev.settings, fontFamily: family },
      };
    });
  }, []);

  const setFontSize = useCallback((size: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        settings: { ...prev.settings, fontSize: size },
      };
    });
  }, []);

  const setLineHeight = useCallback((lineHeight: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const value = lineHeight
        ? parseFloat(lineHeight) || lineHeight
        : undefined;
      return {
        ...prev,
        settings: { ...prev.settings, lineHeight: value },
      };
    });
  }, []);

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

  const resetAdditionalColors = useCallback(() => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }

      const defaultColors = defaultThemeSettings.colors ?? {};
      const updatedColors = { ...prev.settings.colors };

      for (const key of ADDITIONAL_COLOR_KEYS) {
        updatedColors[key] = (defaultColors[key] as string) ?? "";
      }

      updatedColors.charts = defaultColors.charts ?? [];

      return {
        ...prev,
        settings: { ...prev.settings, colors: updatedColors },
      };
    });
  }, [defaultThemeSettings]);

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
    hasAdditionalColorChanges,
    resetAdditionalColors,
    setFontFamily,
    setFontSize,
    setLineHeight,
    handleSave,
    handleDiscard,
  };
}

export type EmbeddingThemeEditorResult = ReturnType<
  typeof useEmbeddingThemeEditor
>;
