import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

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

export function useEmbeddingThemeEditor(themeId: number) {
  const {
    data: serverTheme,
    isLoading,
    isError,
  } = useGetEmbeddingThemeQuery(themeId);
  const [updateTheme] = useUpdateEmbeddingThemeMutation();
  const [sendToast] = useToast();

  const [pristineTheme, setPristineTheme] = useState<ThemeEditorState | null>(
    null,
  );
  const [currentTheme, setCurrentTheme] = useState<ThemeEditorState | null>(
    null,
  );

  // Initialize state when server data arrives
  useEffect(() => {
    if (serverTheme && !pristineTheme) {
      const state: ThemeEditorState = {
        name: serverTheme.name,
        settings: serverTheme.settings,
      };
      setPristineTheme(state);
      setCurrentTheme(state);
    }
  }, [serverTheme, pristineTheme]);

  const isDirty = useMemo(
    () => JSON.stringify(pristineTheme) !== JSON.stringify(currentTheme),
    [pristineTheme, currentTheme],
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
            colors: { ...prev.settings.colors, [key]: value },
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
      charts[index] = value;
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
      setPristineTheme(currentTheme);
      sendToast({ message: t`Theme saved`, icon: "check" });
    } catch (error) {
      console.error("Failed to save theme:", error);
      sendToast({ message: t`Failed to save theme`, icon: "warning" });
    }
  }, [currentTheme, themeId, updateTheme, sendToast]);

  const handleDiscard = useCallback(() => {
    setCurrentTheme(pristineTheme);
  }, [pristineTheme]);

  return {
    isLoading,
    isNotFound: isError,
    pristineTheme,
    currentTheme,
    isDirty,
    setName,
    setColor,
    setChartColor,
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
