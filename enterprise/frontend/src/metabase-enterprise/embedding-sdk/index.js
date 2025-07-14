import { lazyLoadDateLocales } from "embedding-sdk/lib/i18n/lazy-load-date-locales";
import { isEmbeddingSdk } from "metabase/env";
import {
  PLUGIN_EMBEDDING_SDK,
  PLUGIN_LAZY_LOAD_SDK_DATE_LOCALES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("embedding_sdk")) {
  PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
}

if (isEmbeddingSdk) {
  PLUGIN_LAZY_LOAD_SDK_DATE_LOCALES.load = lazyLoadDateLocales;
}
