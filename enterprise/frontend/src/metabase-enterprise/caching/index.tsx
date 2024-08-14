import { PLUGIN_CACHING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { DashboardStrategySidebar } from "./components/DashboardStrategySidebar";
import { GranularControlsExplanation } from "./components/GranularControlsExplanation";
import { InvalidateNowButton } from "./components/InvalidateNowButton";
import { SidebarCacheForm } from "./components/SidebarCacheForm";
import { SidebarCacheSection } from "./components/SidebarCacheSection";
import { StrategyFormLauncherPanel } from "./components/StrategyFormLauncherPanel";
import { enterpriseOnlyCachingStrategies } from "./constants";
import { hasQuestionCacheSection } from "./utils";

if (hasPremiumFeature("cache_granular_controls")) {
  PLUGIN_CACHING.isGranularCachingEnabled = () => true;
  PLUGIN_CACHING.StrategyFormLauncherPanel = StrategyFormLauncherPanel;
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
