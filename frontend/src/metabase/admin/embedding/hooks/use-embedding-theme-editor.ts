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
import {
  type HarmonyMode,
  suggestHarmonyColors,
} from "metabase/ui/colors/harmonies";
import type { ColorHarmonyMode, EmbeddingTheme } from "metabase-types/api";

interface ThemeEditorState {
  name: string;
  settings: MetabaseTheme;
  colorHarmony: ColorHarmonyMode;
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

/** Color keys that the color-harmony generator manages, alongside `charts`. */
const HARMONY_DERIVED_KEYS: Exclude<MetabaseColor, "charts">[] = [
  "filter",
  "summarize",
  "positive",
  "negative",
];

const DEFAULT_DRAFT_HARMONY: HarmonyMode = "octagonal";

const isHarmonyMode = (mode: ColorHarmonyMode): mode is HarmonyMode =>
  mode !== "off";

/** Overwrites the harmony-managed keys on a settings object with values derived from `colors.brand`. */
const applyHarmony = (
  settings: MetabaseTheme,
  mode: HarmonyMode,
): MetabaseTheme => {
  const brand = settings.colors?.brand;
  if (!brand) {
    return settings;
  }
  const harmony = suggestHarmonyColors(brand, mode);
  return {
    ...settings,
    colors: {
      ...settings.colors,
      filter: harmony.filter,
      summarize: harmony.summarize,
      positive: harmony.positive,
      negative: harmony.negative,
      charts: harmony.charts,
    },
  };
};

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
      ? {
          name: t`Untitled theme`,
          settings: applyHarmony(defaultThemeSettings, DEFAULT_DRAFT_HARMONY),
          colorHarmony: DEFAULT_DRAFT_HARMONY,
        }
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
      setCurrentTheme(serverThemeToState(serverTheme));
    }
  }, [isDraft, draftInitial, serverTheme, currentTheme]);

  const baselineState = useMemo(() => {
    if (isDraft) {
      return draftInitial;
    }
    return serverTheme ? serverThemeToState(serverTheme) : null;
  }, [isDraft, draftInitial, serverTheme]);

  const isDirty = useMemo(
    () => !isEqual(baselineState, currentTheme),
    [baselineState, currentTheme],
  );
  const canSave = isDraft || isDirty;

  const setName = useCallback((name: string) => {
    setCurrentTheme((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  const setColor = useCallback(
    (key: Exclude<MetabaseColor, "charts">, value: string) => {
      const lowered = value.toLowerCase();
      setCurrentTheme((prev) => {
        if (!prev) {
          return prev;
        }
        const colors = { ...prev.settings.colors, [key]: lowered };
        const settings = { ...prev.settings, colors };

        // User edited a harmony-managed color: opt out of the harmony.
        if (
          HARMONY_DERIVED_KEYS.includes(key) &&
          isHarmonyMode(prev.colorHarmony)
        ) {
          return { ...prev, settings, colorHarmony: "off" };
        }

        // Brand changed while a harmony is active: regenerate dependents.
        if (key === "brand" && isHarmonyMode(prev.colorHarmony)) {
          return {
            ...prev,
            settings: applyHarmony(settings, prev.colorHarmony),
          };
        }

        return { ...prev, settings };
      });
    },
    [],
  );

  const setChartColor = useCallback((index: number, value: string) => {
    const lowered = value.toLowerCase();
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const charts = [...(prev.settings.colors?.charts ?? [])];
      charts[index] = lowered;
      const settings = {
        ...prev.settings,
        colors: { ...prev.settings.colors, charts },
      };
      // Editing a chart slot opts out of the harmony.
      const colorHarmony: ColorHarmonyMode = isHarmonyMode(prev.colorHarmony)
        ? "off"
        : prev.colorHarmony;
      return { ...prev, settings, colorHarmony };
    });
  }, []);

  const setColorHarmony = useCallback((mode: ColorHarmonyMode) => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      if (!isHarmonyMode(mode)) {
        return { ...prev, colorHarmony: mode };
      }
      return {
        ...prev,
        colorHarmony: mode,
        settings: applyHarmony(prev.settings, mode),
      };
    });
  }, []);

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

      let settings: MetabaseTheme = { ...prev.settings, colors: updatedColors };
      // Keep harmony-derived values consistent with the active mode after a reset.
      if (isHarmonyMode(prev.colorHarmony)) {
        settings = applyHarmony(settings, prev.colorHarmony);
      }
      return { ...prev, settings };
    });
  }, [defaultThemeSettings]);

  const resetMainColors = useCallback(() => {
    setCurrentTheme((prev) => {
      if (!prev) {
        return prev;
      }
      const defaultColors = defaultThemeSettings.colors ?? {};
      const updatedColors = { ...prev.settings.colors };

      for (const key of PRIMARY_COLORS_KEYS) {
        updatedColors[key] = (defaultColors[key] as string) ?? "";
      }

      let settings: MetabaseTheme = { ...prev.settings, colors: updatedColors };
      // Brand may have changed: re-derive dependents to stay in sync with the harmony mode.
      if (isHarmonyMode(prev.colorHarmony)) {
        settings = applyHarmony(settings, prev.colorHarmony);
      }
      return { ...prev, settings };
    });
  }, [defaultThemeSettings]);

  const handleSave = useCallback(async (): Promise<EmbeddingTheme | null> => {
    if (!currentTheme) {
      return null;
    }
    try {
      if (isDraft) {
        const created = await createTheme({
          name: currentTheme.name || t`Untitled theme`,
          settings: currentTheme.settings,
          color_harmony: currentTheme.colorHarmony,
        }).unwrap();
        sendToast({ message: t`Theme saved`, icon: "check" });
        return created;
      }
      const updated = await updateTheme({
        id: themeId as number,
        name: currentTheme.name,
        settings: currentTheme.settings,
        color_harmony: currentTheme.colorHarmony,
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
    setColorHarmony,
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

const serverThemeToState = (theme: EmbeddingTheme): ThemeEditorState => ({
  name: theme.name,
  settings: theme.settings,
  colorHarmony: theme.color_harmony,
});
