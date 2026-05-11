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
import { useSetting, useToast } from "metabase/common/hooks";
import type {
  ChartColor,
  MetabaseColor,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { suggestHarmonyColors } from "metabase/ui/colors/harmonies";
import type { EmbeddingTheme } from "metabase-types/api";
import type { ColorSettings } from "metabase-types/api/settings";

interface ThemeEditorState {
  name: string;
  settings: MetabaseTheme;
}

export type ThemeEditorId = number | "new";

const PRIMARY_COLORS_KEYS: Exclude<MetabaseColor, "charts">[] = [
  "brand",
  "background",
  "text-primary",
];

const chartBase = (c: ChartColor): string =>
  typeof c === "string" ? c : c.base;

const eqColor = (a: string | undefined, b: string | undefined) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/**
 * Returns a copy of `settings` with `filter` / `summarize` / `positive` /
 * `negative` / `charts` overwritten by the values that the harmony would
 * derive from the brand color. If there is no brand color, returns the
 * settings unchanged.
 *
 * Used by the regenerate-from-brand button: the user is explicitly asking
 * to overwrite every harmony-managed color, so whitelabel customizations
 * are not respected here.
 */
const withBrandHarmony = (settings: MetabaseTheme): MetabaseTheme => {
  const brand = settings.colors?.brand;
  if (!brand) {
    return settings;
  }
  const harmony = suggestHarmonyColors(brand);
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

/**
 * Seed for a fresh draft: fills harmony-managed colors with brand-derived
 * values *only when* the corresponding whitelabel key is not set. This keeps
 * a fresh draft in-sync with the harmony when no customizations exist (so
 * the regenerate button stays hidden), while still honoring any
 * `application-colors` overrides the admin has configured.
 */
const seedDraftFromHarmony = (
  settings: MetabaseTheme,
  whitelabelColors: ColorSettings,
): MetabaseTheme => {
  const brand = settings.colors?.brand;
  if (!brand) {
    return settings;
  }
  const harmony = suggestHarmonyColors(brand);
  const existingCharts = settings.colors?.charts ?? [];
  const charts: ChartColor[] = harmony.charts.map((harmonyChart, i) => {
    const accentKey = `accent${i}` as keyof ColorSettings;
    if (whitelabelColors[accentKey] !== undefined) {
      return existingCharts[i] ?? harmonyChart;
    }
    return harmonyChart;
  });
  return {
    ...settings,
    colors: {
      ...settings.colors,
      filter: whitelabelColors.filter ?? harmony.filter,
      summarize: whitelabelColors.summarize ?? harmony.summarize,
      positive: whitelabelColors.success ?? harmony.positive,
      negative: whitelabelColors.danger ?? harmony.negative,
      charts,
    },
  };
};

export function useEmbeddingThemeEditor(themeId: ThemeEditorId) {
  const dispatch = useDispatch();
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
  const whitelabelColors = useSetting("application-colors") ?? {};

  // Seed once on mount when in draft mode so the baseline is stable across
  // renders. Harmony-managed colors are pre-derived from the brand, with any
  // whitelabel overrides preserved.
  const [draftInitial] = useState<ThemeEditorState | null>(() =>
    isDraft
      ? {
          name: t`Untitled theme`,
          settings: seedDraftFromHarmony(
            defaultThemeSettings,
            whitelabelColors,
          ),
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

  const setName = useCallback((name: string) => {
    setCurrentTheme((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  const setColor = useCallback(
    (key: Exclude<MetabaseColor, "charts">, value: string) => {
      setCurrentTheme((prev) =>
        prev
          ? {
              ...prev,
              settings: {
                ...prev.settings,
                colors: { ...prev.settings.colors, [key]: value.toLowerCase() },
              },
            }
          : prev,
      );
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

  const hasMainColorChanges = useMemo(() => {
    if (!currentTheme) {
      return false;
    }
    const colors = currentTheme.settings.colors ?? {};
    const defaultColors = defaultThemeSettings.colors ?? {};
    return PRIMARY_COLORS_KEYS.some(
      (key) => (colors[key] ?? "") !== ((defaultColors[key] as string) ?? ""),
    );
  }, [currentTheme, defaultThemeSettings]);

  /**
   * True when the current filter / summarize / positive / negative / chart colors differ
   * from what would be generated from the current brand color via the color harmony.
   * Drives the regenerate button visibility.
   */
  const hasOutOfSyncAdditionalColors = useMemo(() => {
    if (!currentTheme) {
      return false;
    }
    const colors = currentTheme.settings.colors ?? {};
    const brand = colors.brand;
    if (!brand) {
      return false;
    }
    const expected = suggestHarmonyColors(brand);
    if (!eqColor(colors.filter, expected.filter)) {
      return true;
    }
    if (!eqColor(colors.summarize, expected.summarize)) {
      return true;
    }
    if (!eqColor(colors.positive, expected.positive)) {
      return true;
    }
    if (!eqColor(colors.negative, expected.negative)) {
      return true;
    }
    const currentCharts = (colors.charts ?? []).map(chartBase);
    return expected.charts.some((c, i) => !eqColor(currentCharts[i], c));
  }, [currentTheme]);

  const regenerateAdditionalColorsFromBrand = useCallback(() => {
    if (!currentTheme?.settings.colors?.brand) {
      return;
    }
    setCurrentTheme({
      ...currentTheme,
      settings: withBrandHarmony(currentTheme.settings),
    });
    dispatch(
      addUndo({
        message: t`Filter, summarize, positive, negative, and chart colors regenerated from the brand color.`,
        actionLabel: t`Undo`,
        actions: [() => setCurrentTheme(currentTheme)],
      }),
    );
  }, [currentTheme, dispatch]);

  const resetMainColors = useCallback(() => {
    if (!currentTheme) {
      return;
    }
    const defaultColors = defaultThemeSettings.colors ?? {};
    const updatedColors = { ...currentTheme.settings.colors };
    for (const key of PRIMARY_COLORS_KEYS) {
      updatedColors[key] = (defaultColors[key] as string) ?? "";
    }
    setCurrentTheme({
      ...currentTheme,
      settings: { ...currentTheme.settings, colors: updatedColors },
    });
    dispatch(
      addUndo({
        message: t`Main colors reset to defaults.`,
        actionLabel: t`Undo`,
        actions: [() => setCurrentTheme(currentTheme)],
      }),
    );
  }, [currentTheme, defaultThemeSettings, dispatch]);

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
    hasOutOfSyncAdditionalColors,
    regenerateAdditionalColorsFromBrand,
    setFontFamily,
    setFontSize,
    handleSave,
    handleDiscard,
  };
}

export type EmbeddingThemeEditorResult = ReturnType<
  typeof useEmbeddingThemeEditor
>;
