import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { useTranslateContent } from "./use-translate-content";
import {
  shouldTranslateFieldValuesOfColumn,
  translateDisplayNames,
  translateFieldValuesInHoveredObject,
  useTranslateSeries,
} from "./utils";

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
    useTranslateContent,
    translateDisplayNames,
    ContentTranslationConfiguration,
    shouldTranslateFieldValuesOfColumn,
    translateFieldValuesInHoveredObject,
    useTranslateSeries,
    // This gets overwritten in static embedding
    contentTranslationDictionaryUrl: null,
  });
}
