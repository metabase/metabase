import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { useTranslateContent } from "./use-translate-content";
import {
  shouldTranslateFieldValuesOfColumn,
  translateDisplayNames,
  translateFieldValuesInHoveredObject,
  translateFieldValuesInSeries,
  translateSeries,
} from "./utils";

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
    useTranslateContent,
    translateDisplayNames,
    ContentTranslationConfiguration,
    shouldTranslateFieldValuesOfColumn,
    translateFieldValuesInHoveredObject,
    translateFieldValuesInSeries,
    translateSeries,
  });
}
