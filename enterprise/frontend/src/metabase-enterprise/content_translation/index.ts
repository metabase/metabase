import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { contentTranslationEndpoints } from "./constants";
import {
  useSortByContentTranslation,
  useTranslateFieldValuesInHoveredObject,
  useTranslateSeries,
} from "./hooks";
import { useTranslateContent } from "./use-translate-content";
import { translateDisplayNames } from "./utils";

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
