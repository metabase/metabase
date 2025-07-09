import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { DASHBOARD_EDITING_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { ColumnFormattingAction } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction";
import { CombineColumnsAction } from "metabase/visualizations/click-actions/actions/CombineColumnsAction";
import { DashboardClickAction } from "metabase/visualizations/click-actions/actions/DashboardClickAction";
import { ExtractColumnAction } from "metabase/visualizations/click-actions/actions/ExtractColumnAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";
import { NativeQueryClickFallback } from "metabase/visualizations/click-actions/actions/NativeQueryClickFallback";
import { Mode } from "metabase/visualizations/click-actions/Mode/Mode";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";

import type {
  DashboardMode,
  DashboardModeConfig,
  ResolvedDashboardMode,
  DashboardActionType,
  DrillType,
  ClickActionType,
} from "../types/dashboard-mode";

// Maps user-friendly dashboard actions to internal action keys
const DASHBOARD_ACTION_MAP: Record<DashboardActionType, string> = {
  edit: DASHBOARD_ACTION.EDIT_DASHBOARD,
  "download-pdf": DASHBOARD_ACTION.DOWNLOAD_PDF,
  share: DASHBOARD_ACTION.DASHBOARD_SHARING,
  refresh: DASHBOARD_ACTION.REFRESH_WIDGET,
  fullscreen: DASHBOARD_ACTION.FULLSCREEN_TOGGLE,
  info: DASHBOARD_ACTION.DASHBOARD_INFO,
  bookmark: DASHBOARD_ACTION.DASHBOARD_BOOKMARK,
  duplicate: DASHBOARD_ACTION.COPY_ANALYTICS_DASHBOARD,
};

// Maps user-friendly drill types to internal drill type strings
const DRILL_TYPE_MAP: Record<DrillType, string> = {
  "column-filter": "drill-thru/column-filter",
  "column-extract": "drill-thru/column-extract",
  distribution: "drill-thru/distribution",
  "fk-details": "drill-thru/fk-details",
  "fk-filter": "drill-thru/fk-filter",
  pivot: "drill-thru/pivot",
  "quick-filter": "drill-thru/quick-filter",
  sort: "drill-thru/sort",
  "summarize-column": "drill-thru/summarize-column",
  "summarize-column-by-time": "drill-thru/summarize-column-by-time",
  "underlying-records": "drill-thru/underlying-records",
  "zoom-binning": "drill-thru/zoom-in.binning",
  "zoom-geographic": "drill-thru/zoom-in.geographic",
  "zoom-timeseries": "drill-thru/zoom-in.timeseries",
};

// Maps user-friendly click actions to internal action classes
const CLICK_ACTION_MAP: Record<ClickActionType, any> = {
  "hide-column": HideColumnAction,
  "format-column": ColumnFormattingAction,
  "extract-column": ExtractColumnAction,
  "combine-columns": CombineColumnsAction,
  "dashboard-click": DashboardClickAction,
};

/**
 * Resolves a dashboard mode (string or config) to a full configuration
 */
export function resolveDashboardMode(
  mode: DashboardMode,
): ResolvedDashboardMode {
  if (typeof mode === "string") {
    // Handle preset modes
    const presetConfig = PRESET_MODES[mode];
    if (!presetConfig) {
      throw new Error(`Unknown dashboard mode: ${mode}`);
    }
    return presetConfig;
  }

  // Handle full configuration
  return {
    name: mode.name,
    dashboard: mode.dashboard,
    questions: mode.questions,
  };
}

/**
 * Converts user-friendly dashboard actions to internal action keys
 */
export function resolveDashboardActions(
  actions: DashboardActionType[],
  editing: boolean,
  downloadsEnabled: { pdf: boolean; results: boolean },
): string[] {
  // If editing is enabled, use editing actions
  if (editing) {
    return DASHBOARD_EDITING_ACTIONS;
  }

  // Otherwise, map user actions to internal keys
  const resolvedActions = actions
    .map((action) => DASHBOARD_ACTION_MAP[action])
    .filter(Boolean);

  // Auto-include download actions if enabled
  if (
    downloadsEnabled.pdf &&
    !resolvedActions.includes(DASHBOARD_ACTION.DOWNLOAD_PDF)
  ) {
    resolvedActions.push(DASHBOARD_ACTION.DOWNLOAD_PDF);
  }

  return resolvedActions;
}

/**
 * Creates a QueryClickActionsMode from user-friendly question config
 */
export function resolveQuestionMode(
  config: ResolvedDashboardMode["questions"],
  plugins?: MetabasePluginsConfig,
): QueryClickActionsMode {
  // Handle drilling configuration
  let hasDrills = false;
  let availableOnlyDrills: string[] | undefined;

  if (config.drilling === true) {
    hasDrills = true;
  } else if (Array.isArray(config.drilling)) {
    hasDrills = true;
    availableOnlyDrills = config.drilling.map((drill) => DRILL_TYPE_MAP[drill]);
  }

  // Handle click actions
  let clickActions: any[] = [];
  if (config.clickActions === true) {
    // Use all available click actions
    clickActions = Object.values(CLICK_ACTION_MAP);
  } else if (Array.isArray(config.clickActions)) {
    clickActions = config.clickActions
      .map((action) => CLICK_ACTION_MAP[action])
      .filter(Boolean);
  }

  // Handle fallback
  let fallback = undefined;
  if (config.fallback === "native-query") {
    fallback = NativeQueryClickFallback;
  }

  return {
    name: "dashboard-mode",
    hasDrills,
    availableOnlyDrills,
    clickActions,
    fallback,
  };
}

/**
 * Creates a navigation handler from user-friendly navigation config
 */
export function resolveNavigation(
  config: ResolvedDashboardMode["questions"]["navigation"],
): ((opts: any) => void) | null {
  if (config === false) {
    return null;
  }

  if (config === true) {
    // Default navigation behavior
    return (opts) => {
      console.log("Navigate to question:", opts);
    };
  }

  if (typeof config === "object" && config.enabled) {
    if (config.customHandler) {
      return (opts) => config.customHandler!(opts.questionId, opts.filters);
    }

    // Default with new tab option
    return (opts) => {
      console.log("Navigate to question:", opts, "newTab:", config.newTab);
    };
  }

  return null;
}

// Preset dashboard modes
const PRESET_MODES: Record<string, ResolvedDashboardMode> = {
  editable: {
    name: "editable",
    dashboard: {
      actions: [
        "edit",
        "download-pdf",
        "share",
        "refresh",
        "fullscreen",
        "info",
      ],
      downloads: ["pdf", "csv", "xlsx"],
      editing: true,
    },
    questions: {
      drilling: true,
      clickActions: true,
      navigation: true,
      fallback: "default",
    },
  },

  interactive: {
    name: "interactive",
    dashboard: {
      actions: ["download-pdf", "refresh", "fullscreen"],
      downloads: ["pdf", "csv", "xlsx"],
      editing: false,
    },
    questions: {
      drilling: true,
      clickActions: ["hide-column", "dashboard-click"],
      navigation: true,
      fallback: "default",
    },
  },

  static: {
    name: "static",
    dashboard: {
      actions: ["download-pdf"],
      downloads: ["pdf"],
      editing: false,
    },
    questions: {
      drilling: false,
      clickActions: false,
      navigation: false,
      fallback: "native-query",
    },
  },
};
