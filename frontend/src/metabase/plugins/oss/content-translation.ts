import { useCallback } from "react";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { HoveredObject } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";

export const PLUGIN_CONTENT_TRANSLATION = {
  isEnabled: false,
  setEndpointsForStaticEmbedding: (_encodedToken: string) => {},
  ContentTranslationConfiguration: PluginPlaceholder,
  useTranslateContent: <
    T = string | null | undefined,
  >(): ContentTranslationFunction => {
    return useCallback(<U = T>(arg: U) => arg, []);
  },
  translateDisplayNames: <T extends object>(
    obj: T,
    _tc: ContentTranslationFunction,
  ) => obj,
  useTranslateFieldValuesInHoveredObject: (obj?: HoveredObject | null) => obj,
  useTranslateSeries: (obj: Series) => obj,
  useSortByContentTranslation: () => (a: string, b: string) =>
    a.localeCompare(b),
};
