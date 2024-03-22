import { t } from "ttag";

import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import { Stack, Title } from "metabase/ui";
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

  PLUGIN_CACHING.canOverrideRootCacheInvalidationStrategy = true;
  PLUGIN_CACHING.showAd = false;
  PLUGIN_CACHING.explanation = (
    <Stack spacing="xl">
      {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated. You can set up one rule for all your databases, or apply more specific settings to each database.`}
      <Title
        order={4}
      >{t`Pick the policy for when cached query results should be invalidated.`}</Title>
    </Stack>
  );
}
