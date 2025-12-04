import { useCallback } from "react";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { HoveredObject } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";

const getDefaultPluginContentTranslation = () => ({
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
});

export const PLUGIN_CONTENT_TRANSLATION = getDefaultPluginContentTranslation();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_CONTENT_TRANSLATION,
    getDefaultPluginContentTranslation(),
  );
}
