import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { contentTranslationEndpoints } from "./constants";
import { useTranslateContent } from "./use-translate-content";
import {
  translateDisplayNames,
  useSortByContentTranslation,
  useTranslateFieldValuesInHoveredObject,
  useTranslateSeries,
} from "./utils";

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
    useSortByContentTranslation,
    useTranslateContent,
    useTranslateFieldValuesInHoveredObject,
    useTranslateSeries,
    setEndpointsForStaticEmbedding: (encodedToken: string) => {
      contentTranslationEndpoints.getDictionary = `/api/ee/content-translation/dictionary/${encodedToken}`;
    },
    translateDisplayNames,
    ContentTranslationConfiguration,
  });
}
