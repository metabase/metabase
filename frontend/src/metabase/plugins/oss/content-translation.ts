import { useCallback } from "react";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { HoveredObject } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

const getDefaultPluginContentTranslation = () => ({
  isEnabled: false,
  getDictionaryBasePath: null as string | null,
  setEndpointsForAuthEmbedding: () => {},
  setEndpointsForStaticEmbedding: (_encodedToken: EntityToken) => {},
  ContentTranslationConfiguration: PluginPlaceholder,
  useTranslateContent: <
    T = string | null | undefined,
  >(): ContentTranslationFunction => {
    return useCallback(<U = T>(arg: U) => arg, []);
  },
  translateDisplayNames: <T extends object>({
    obj,
  }: {
    obj: T;
    tc: ContentTranslationFunction;
    locale: string;
  }) => obj,
  translateColumnDisplayName: ({
    displayName,
  }: {
    displayName: string;
    tc: ContentTranslationFunction;
    locale: string;
  }): string => displayName,
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
