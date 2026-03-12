import type { ComponentType, Dispatch, SetStateAction } from "react";

import {
  getPerformanceTabMetadata,
  strategies,
} from "metabase/admin/performance/constants/complex";
import type { ModelWithClearableCache } from "metabase/admin/performance/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { ModalOverlayProps, StackProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { CacheableDashboard, CacheableModel } from "metabase-types/api";

// Types
export type InvalidateNowButtonProps = {
  targetId: number;
  targetModel: ModelWithClearableCache;
  targetName: string;
};

export type SidebarCacheSectionProps = {
  item: CacheableDashboard | Question;
  model: CacheableModel;
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
};

export type SidebarCacheFormProps = {
  item: CacheableDashboard | Question;
  model: CacheableModel;
  isOpen: boolean;
  withOverlay?: boolean;
  overlayProps?: ModalOverlayProps;
  onClose: () => void;
  onBack: () => void;
} & StackProps;

export type PreemptiveCachingSwitchProps = {
  handleSwitchToggle: () => void;
};

export type MetricSettingsPageProps = {
  params: { cardId: string };
};

const getDefaultPluginCaching = () => ({
  isGranularCachingEnabled: () => false,
  StrategyFormLauncherPanel: PluginPlaceholder as any,
  GranularControlsExplanation: PluginPlaceholder as any,
  SidebarCacheSection:
    PluginPlaceholder as ComponentType<SidebarCacheSectionProps>,
  SidebarCacheForm: PluginPlaceholder as ComponentType<SidebarCacheFormProps>,
  InvalidateNowButton:
    PluginPlaceholder as ComponentType<InvalidateNowButtonProps>,
  hasQuestionCacheSection: (_question: Question) => false,
  canOverrideRootStrategy: false,
  strategies: strategies,
  DashboardAndQuestionCachingTab: PluginPlaceholder as any,
  StrategyEditorForQuestionsAndDashboards: PluginPlaceholder as any,
  getTabMetadata: getPerformanceTabMetadata,
  PreemptiveCachingSwitch:
    PluginPlaceholder as ComponentType<PreemptiveCachingSwitchProps>,
  MetricCachingPage:
    PluginPlaceholder as ComponentType<MetricSettingsPageProps>,
});

export const PLUGIN_CACHING = getDefaultPluginCaching();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CACHING, getDefaultPluginCaching());
}
