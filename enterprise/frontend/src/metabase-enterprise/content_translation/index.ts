import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
import { useTranslateContent } from "./use-translate-content";
import {
  ContentTranslationConfiguration,
  LocalizableEditableText,
} from "./components";

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
    useTranslateContent,
    ContentTranslationConfiguration,
    LocalizableEditableText,
  });
}
