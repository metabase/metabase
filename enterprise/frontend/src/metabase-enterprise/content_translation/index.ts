import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import {
  contentTranslationEndpoints,
  dictionaryEndpointStore,
} from "./constants";
import { useTranslateContent } from "./use-translate-content";
import {
  getTranslatedFilterDisplayName,
  translateAggregationDisplayName,
  translateDisplayNames,
  useSortByContentTranslation,
  useTranslateFieldValuesInHoveredObject,
  useTranslateSeries,
} from "./utils";

/**
 * Initialize content translation plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("content_translation")) {
    const getDictionaryBasePath = `/api/ee/content-translation/dictionary`;

    Object.assign(PLUGIN_CONTENT_TRANSLATION, {
      isEnabled: true,
      useSortByContentTranslation,
      useTranslateContent,
      useTranslateFieldValuesInHoveredObject,
      useTranslateSeries,
      getDictionaryBasePath,
      setEndpointsForAuthEmbedding: () => {
        if (contentTranslationEndpoints.getDictionary) {
          return;
        }

        dictionaryEndpointStore.setEndpoint(getDictionaryBasePath);
      },
      setEndpointsForStaticEmbedding: (encodedToken: string) => {
        if (contentTranslationEndpoints.getDictionary) {
          return;
        }

        dictionaryEndpointStore.setEndpoint(
          `${getDictionaryBasePath}/${encodedToken}`,
        );
      },
      translateDisplayNames,
      translateAggregationDisplayName,
      getTranslatedFilterDisplayName,
      ContentTranslationConfiguration,
    });
  }
}
