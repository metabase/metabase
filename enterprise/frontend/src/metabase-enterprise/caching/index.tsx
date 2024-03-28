import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import { Stack, Title } from "metabase/ui";

import CacheTTLField from "./components/CacheTTLField";
import DashboardCacheSection from "./components/DashboardCacheSection";
import DatabaseCacheTimeField from "./components/DatabaseCacheTimeField";
import DatabaseCacheTTLField from "./components/DatabaseCacheTTLField";
import QuestionCacheSection from "./components/QuestionCacheSection";
import QuestionCacheTTLField from "./components/QuestionCacheTTLField";
import {
  getQuestionsImplicitCacheTTL,
  hasQuestionCacheSection,
  normalizeCacheTTL,
  validateCacheTTL
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
  PLUGIN_CACHING.canOverrideRootStrategy = true;
  PLUGIN_CACHING.explanation = (
    <Stack spacing="xl">
      {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated. You can set up one rule for all your databases, or apply more specific settings to each database.`}
      <Title
        order={4}
      >{t`Pick the policy for when cached query results should be invalidated.`}</Title>
    </Stack>
  );
}
