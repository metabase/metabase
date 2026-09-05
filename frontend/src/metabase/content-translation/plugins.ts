import { useCallback } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import { definePluginSlot } from "metabase/plugins/slot";
import type { HoveredObject } from "metabase/viz-core";
import type { EntityToken } from "metabase-types/api/entity";

import type {
  ContentTranslationFunction,
  TranslatableSingleSeries,
} from "./types";

const getDefaultPluginContentTranslation = () => ({
  isEnabled: false,
  // Widened so the EE plugin can assign the dictionary path.
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
  useTranslateSeries: <T extends TranslatableSingleSeries>(obj: T[]) => obj,
  useSortByContentTranslation: () => (a: string, b: string) =>
    a.localeCompare(b),
});

export const PLUGIN_CONTENT_TRANSLATION = definePluginSlot(
  getDefaultPluginContentTranslation,
);
