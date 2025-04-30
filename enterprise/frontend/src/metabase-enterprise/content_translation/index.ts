import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { useTranslateContent } from "./use-translate-content";

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
    useTranslateContent,
    ContentTranslationConfiguration,
  });
}
