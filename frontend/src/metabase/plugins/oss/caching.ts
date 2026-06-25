import type { ComponentType, Dispatch, SetStateAction } from "react";
import { t } from "ttag";
import type { AnySchema } from "yup";
import * as Yup from "yup";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { AdminPath } from "metabase/redux/store";
import type { ModalOverlayProps, StackProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  CacheableDashboard,
  CacheableModel,
  CardId,
} from "metabase-types/api";

// Types

export type StrategyLabel =
  | string
  | ((model?: CacheableModel) => string | undefined);

export type StrategyData = {
  label: StrategyLabel;
  description?: StrategyLabel;
  shortLabel?: StrategyLabel;
  /** Schema used to validate the value. This field can optionally be set to a function that returns a schema. This helps ensure that calls to ttag functions do not run until after the locale is set */
  validationSchema: AnySchema | (() => AnySchema);
};

export enum PerformanceTabId {
  Databases = "databases",
  Models = "models",
  DashboardsAndQuestions = "dashboards-and-questions",
}

export type ModelWithClearableCache = Exclude<CacheableModel, "root">;

/** The default policy's cache cannot be cleared. But objects of other kinds,
 * such as dashboards, databases, and questions, can have their cache cleared
 * (if they have a cache) */
export const isModelWithClearableCache = (
  model: CacheableModel,
): model is ModelWithClearableCache => model !== "root";

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

export interface MetricCachingModalProps {
  cardId: CardId;
  cardName: string;
  onClose: () => void;
}

// OSS caching strategies. These are the defaults for
// PLUGIN_CACHING.strategies and the building blocks for their validation;
// the enterprise caching plugin extends them with premium strategies.

export const defaultMinDurationMs = 1000;

/** Rather than a constant defined in the module scope, this is a function. This way, ttag.t runs *after* the locale is set */
export const getPositiveIntegerSchema = () =>
  Yup.number()
    .positive(t`Enter a positive number.`)
    .integer(t`Enter an integer.`);

export const inheritStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["inherit"]),
});

export const doNotCacheStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["nocache"]),
});

/** Rather than a constant defined in the module scope, this is a function. This way, ttag.t runs *after* the locale is set */
export const getAdaptiveStrategyValidationSchema = () => {
  const positiveInteger = getPositiveIntegerSchema();
  return Yup.object({
    type: Yup.string().equals(["ttl"]),
    min_duration_ms: positiveInteger.default(defaultMinDurationMs),
    min_duration_seconds: positiveInteger.default(
      Math.ceil(defaultMinDurationMs / 1000),
    ),
    multiplier: positiveInteger.default(10),
  });
};

export const strategies = {
  inherit: {
    // NOTE: We use functions for labels because otherwise t doesn't work properly
    label: () => t`Default`,
    description: (model?: CacheableModel) => {
      switch (model) {
        case "database":
          return t`Use the default policy`;
        case "dashboard":
          return t`Each question will use its own policy or the database policy`;
        case "question":
        case "metric":
          return t`Use the database or dashboard policy`;
        default:
          return undefined;
      }
    },
    shortLabel: () => t`Default`,
    validationSchema: inheritStrategyValidationSchema,
  },
  // NOTE: The strategy is called 'ttl' in the BE, but we've renamed it 'Adaptive' in the FE
  ttl: {
    label: () => t`Adaptive`,
    description: () =>
      t`Use a query’s average execution time to determine how long to cache its results`,
    shortLabel: () => t`Adaptive`,
    validationSchema: getAdaptiveStrategyValidationSchema,
  },
  nocache: {
    label: () => t`Don’t cache results`,
    shortLabel: () => t`No caching`,
    validationSchema: doNotCacheStrategyValidationSchema,
  },
} as Record<string, StrategyData>;

export const getPerformanceTabMetadata = () =>
  [
    {
      name: t`Database caching`,
      path: "/admin/performance/databases",
      key: "performance-databases",
      tabId: PerformanceTabId.Databases,
    },
    {
      name: t`Model persistence`,
      path: "/admin/performance/models",
      key: "performance-models",
      tabId: PerformanceTabId.Models,
    },
  ] as (AdminPath & { tabId: string })[];

// Plugin definition

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
  MetricCachingModal:
    PluginPlaceholder as ComponentType<MetricCachingModalProps>,
});

export const PLUGIN_CACHING = getDefaultPluginCaching();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CACHING, getDefaultPluginCaching());
}
