import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import CacheTTLField from "./components/CacheTTLField";
import DashboardCacheSection from "./components/DashboardCacheSection";
import DatabaseCacheTTLField from "./components/DatabaseCacheTTLField";
import DatabaseCacheTimeField from "./components/DatabaseCacheTimeField";
import QuestionCacheSection from "./components/QuestionCacheSection";
import QuestionCacheTTLField from "./components/QuestionCacheTTLField";
import {
  getQuestionsImplicitCacheTTL,
  validateCacheTTL,
  normalizeCacheTTL,
  hasQuestionCacheSection,
} from "./utils";

if (hasPremiumFeature("cache_granular_controls")) {
  PLUGIN_CACHING.cacheTTLFormField = {
    name: "cache_ttl",
    validate: validateCacheTTL,
    normalize: normalizeCacheTTL,
  };

  PLUGIN_FORM_WIDGETS.dashboardCacheTTL = CacheTTLField;
  PLUGIN_FORM_WIDGETS.databaseCacheTTL = DatabaseCacheTTLField;
  PLUGIN_FORM_WIDGETS.questionCacheTTL = QuestionCacheTTLField;

  PLUGIN_CACHING.getQuestionsImplicitCacheTTL = getQuestionsImplicitCacheTTL;
  PLUGIN_CACHING.DatabaseCacheTimeField = DatabaseCacheTimeField;
  PLUGIN_CACHING.DashboardCacheSection = DashboardCacheSection;
  PLUGIN_CACHING.QuestionCacheSection = QuestionCacheSection;
  PLUGIN_CACHING.isEnabled = () => true;
  PLUGIN_CACHING.hasQuestionCacheSection = hasQuestionCacheSection;
}
