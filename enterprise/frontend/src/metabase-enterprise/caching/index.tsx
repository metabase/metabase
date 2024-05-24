import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import CacheTTLField from "./components/CacheTTLField";
import { DashboardStrategySidebar } from "./components/DashboardStrategySidebar";
import { GranularControlsExplanation } from "./components/GranularControlsExplanation";
import { InvalidateNowButton } from "./components/InvalidateNowButton";
import QuestionCacheTTLField from "./components/QuestionCacheTTLField";
import { SidebarCacheForm } from "./components/SidebarCacheForm";
import { SidebarCacheSection } from "./components/SidebarCacheSection";
import { StrategyFormLauncherPanel } from "./components/StrategyFormLauncherPanel";
import { enterpriseOnlyCachingStrategies } from "./constants";
import {
  getQuestionsImplicitCacheTTL,
  hasQuestionCacheSection,
  normalizeCacheTTL,
  validateCacheTTL,
} from "./utils";

if (hasPremiumFeature("cache_granular_controls")) {
  PLUGIN_CACHING.cacheTTLFormField = {
    name: "cache_ttl",
    validate: validateCacheTTL,
    normalize: normalizeCacheTTL,
  };

  PLUGIN_FORM_WIDGETS.dashboardCacheTTL = CacheTTLField;
  PLUGIN_FORM_WIDGETS.questionCacheTTL = QuestionCacheTTLField;

  PLUGIN_CACHING.getQuestionsImplicitCacheTTL = getQuestionsImplicitCacheTTL;
  PLUGIN_CACHING.StrategyFormLauncherPanel = StrategyFormLauncherPanel;
  PLUGIN_CACHING.isEnabled = () => true;
  PLUGIN_CACHING.hasQuestionCacheSection = hasQuestionCacheSection;
  PLUGIN_CACHING.canOverrideRootStrategy = true;
  PLUGIN_CACHING.GranularControlsExplanation = GranularControlsExplanation;
  PLUGIN_CACHING.InvalidateNowButton = InvalidateNowButton;
  PLUGIN_CACHING.DashboardStrategySidebar = DashboardStrategySidebar;
  PLUGIN_CACHING.SidebarCacheSection = SidebarCacheSection;
  PLUGIN_CACHING.SidebarCacheForm = SidebarCacheForm;
  PLUGIN_CACHING.strategies = {
    inherit: PLUGIN_CACHING.strategies.inherit,
    duration: enterpriseOnlyCachingStrategies.duration,
    schedule: enterpriseOnlyCachingStrategies.schedule,
    ttl: PLUGIN_CACHING.strategies.ttl,
    nocache: PLUGIN_CACHING.strategies.nocache,
  };
}
