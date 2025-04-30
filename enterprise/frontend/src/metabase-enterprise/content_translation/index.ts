import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ContentTranslationConfiguration } from "./components";
<<<<<<< HEAD
import { useTranslateContent } from "./use-translate-content";
import { translateDisplayNames } from "./utils";
||||||| parent of 0383a2c560e (Introduce useTranslateContent hook and translateContentString utility function)
=======
import { useTranslateContent } from "./hooks";
>>>>>>> 0383a2c560e (Introduce useTranslateContent hook and translateContentString utility function)

if (hasPremiumFeature("content_translation")) {
  Object.assign(PLUGIN_CONTENT_TRANSLATION, {
    isEnabled: true,
<<<<<<< HEAD
    useTranslateContent,
    translateDisplayNames,
||||||| parent of 0383a2c560e (Introduce useTranslateContent hook and translateContentString utility function)
=======
    useTranslateContent,
>>>>>>> 0383a2c560e (Introduce useTranslateContent hook and translateContentString utility function)
    ContentTranslationConfiguration,
  });
}
