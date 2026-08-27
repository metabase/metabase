import { PLUGIN_CACHING, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  enterpriseOnlyCachingStrategies,
  getEnterprisePerformanceTabMetadata,
} from "./constants";
import { hasQuestionCacheSection } from "./utils";

/**
 * Initialize caching plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("cache_granular_controls")) {
    PLUGIN_CACHING.isGranularCachingEnabled = () => true;
    PLUGIN_CACHING.DatabaseCachingEditor = lazyPluginComponent(() =>
      import("./components/DatabaseCachingEditor").then(
        ({ DatabaseCachingEditor }) => DatabaseCachingEditor,
      ),
    );
    PLUGIN_CACHING.hasQuestionCacheSection = hasQuestionCacheSection;
    PLUGIN_CACHING.canOverrideRootStrategy = true;
    PLUGIN_CACHING.InvalidateNowButton = lazyPluginComponent(() =>
      import("./components/InvalidateNowButton").then(
        ({ InvalidateNowButton }) => InvalidateNowButton,
      ),
    );
    PLUGIN_CACHING.SidebarCacheSection = lazyPluginComponent(() =>
      import("./components/SidebarCacheSection").then(
        ({ SidebarCacheSection }) => SidebarCacheSection,
      ),
    );
    PLUGIN_CACHING.SidebarCacheForm = lazyPluginComponent(() =>
      import("./components/SidebarCacheForm").then(
        ({ SidebarCacheForm }) => SidebarCacheForm,
      ),
    );
    PLUGIN_CACHING.strategies = {
      inherit: PLUGIN_CACHING.strategies.inherit,
      duration: enterpriseOnlyCachingStrategies.duration,
      schedule: enterpriseOnlyCachingStrategies.schedule,
      ttl: PLUGIN_CACHING.strategies.ttl,
      nocache: PLUGIN_CACHING.strategies.nocache,
    };
    PLUGIN_CACHING.DashboardAndQuestionCachingTab = lazyPluginComponent(() =>
      import("./components/DashboardAndQuestionCachingTab").then(
        ({ DashboardAndQuestionCachingTab }) => DashboardAndQuestionCachingTab,
      ),
    );
    PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards =
      lazyPluginComponent(() =>
        import("./components/StrategyEditorForQuestionsAndDashboards/StrategyEditorForQuestionsAndDashboards").then(
          ({ StrategyEditorForQuestionsAndDashboards }) =>
            StrategyEditorForQuestionsAndDashboards,
        ),
      );
    PLUGIN_CACHING.getTabMetadata = getEnterprisePerformanceTabMetadata;
    PLUGIN_CACHING.MetricCachingModal = lazyPluginComponent(() =>
      import("./components/MetricCachingModal").then(
        ({ MetricCachingModal }) => MetricCachingModal,
      ),
    );
  }

  if (hasPremiumFeature("cache_preemptive")) {
    PLUGIN_CACHING.PreemptiveCachingSwitch = lazyPluginComponent(() =>
      import("./components/PreemptiveCachingSwitch").then(
        ({ PreemptiveCachingSwitch }) => PreemptiveCachingSwitch,
      ),
    );
  }
}
