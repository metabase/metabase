import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import { useDefaultEmbeddingThemeSettings } from "metabase/admin/embedding/hooks/use-default-embedding-theme-settings";
import { skipToken } from "metabase/api";
import {
  useCreateEmbeddingThemeMutation,
  useGetEmbeddingThemeQuery,
  useUpdateEmbeddingThemeMutation,
} from "metabase/api/embedding-theme";
import { useToast } from "metabase/common/hooks";
import type {
  MetabaseColor,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import type { EmbeddingTheme } from "metabase-types/api";

interface ThemeEditorState {
  name: string;
  settings: MetabaseTheme;
}

export type ThemeEditorId = number | "new";

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

export function useEmbeddingThemeEditor(themeId: ThemeEditorId) {
  const isDraft = themeId === "new";
  const {
    data: serverTheme,
    isLoading: isLoadingServer,
    isError,
  } = useGetEmbeddingThemeQuery(isDraft ? skipToken : themeId);
  const [createTheme] = useCreateEmbeddingThemeMutation();
  const [updateTheme] = useUpdateEmbeddingThemeMutation();
  const [sendToast] = useToast();
  const defaultThemeSettings = useDefaultEmbeddingThemeSettings();

  // Seed once on mount when in draft mode so the baseline is stable across renders.
  const [draftInitial] = useState<ThemeEditorState | null>(() =>
    isDraft
      ? { name: t`Untitled theme`, settings: defaultThemeSettings }
      : null,
  );

  const [currentTheme, setCurrentTheme] = useState<ThemeEditorState | null>(
    null,
  );

  useEffect(() => {
    if (currentTheme) {
      return;
    }
    if (isDraft && draftInitial) {
      setCurrentTheme(draftInitial);
    } else if (serverTheme) {
      setCurrentTheme({
        name: serverTheme.name,
        settings: serverTheme.settings,
      });
    }
  }, [isDraft, draftInitial, serverTheme, currentTheme]);

  const baselineState = useMemo(() => {
    if (isDraft) {
      return draftInitial;
    }
    return serverTheme
      ? { name: serverTheme.name, settings: serverTheme.settings }
      : null;
  }, [isDraft, draftInitial, serverTheme]);

  const isDirty = useMemo(
    () => !isEqual(baselineState, currentTheme),
    [baselineState, currentTheme],
  );
  const canSave = isDraft || isDirty;

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

  const setFontFamily = useCallback((family: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const { fontFamily: _omit, ...rest } = prev.settings;
      return {
        ...prev,
        settings: family ? { ...rest, fontFamily: family } : rest,
      };
    });
  }, []);

  const setFontSize = useCallback((size: string) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const { fontSize: _omit, ...rest } = prev.settings;
      return {
        ...prev,
        settings: size ? { ...rest, fontSize: size } : rest,
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

  const handleSave = useCallback(async (): Promise<EmbeddingTheme | null> => {
    if (!currentTheme) {
      return null;
    }
    try {
      if (isDraft) {
        const created = await createTheme({
          name: currentTheme.name || t`Untitled theme`,
          settings: currentTheme.settings,
        }).unwrap();
        sendToast({ message: t`Theme saved`, icon: "check" });
        return created;
      }
      const updated = await updateTheme({
        id: themeId as number,
        name: currentTheme.name,
        settings: currentTheme.settings,
      }).unwrap();
      sendToast({ message: t`Theme saved`, icon: "check" });
      return updated;
    } catch (error) {
      console.error("Failed to save theme:", error);
      sendToast({ message: t`Failed to save theme`, icon: "warning" });
      return null;
    }
  }, [currentTheme, isDraft, themeId, createTheme, updateTheme, sendToast]);

  const handleDiscard = useCallback(() => {
    setCurrentTheme(baselineState);
  }, [baselineState]);

  return {
    isLoading: isDraft ? false : isLoadingServer,
    isNotFound: isError,
    isDraft,
    currentTheme,
    isDirty,
    canSave,
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
