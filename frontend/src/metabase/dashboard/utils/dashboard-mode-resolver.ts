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

interface ResolveActionsOptions {
  actions: DashboardActionType[];
  editing: boolean;
  downloadsEnabled: { pdf: boolean; results: boolean };
}

export function resolveDashboardActions(options: ResolveActionsOptions): string[] {
  const { actions, editing, downloadsEnabled } = options;
  
  if (editing) {
    return DASHBOARD_EDITING_ACTIONS;
  }

  const resolvedActions: string[] = [];
  
  for (const action of actions) {
    const mappedAction = DASHBOARD_ACTION_MAP[action];
    if (mappedAction) {
      resolvedActions.push(mappedAction);
    }
  }

  if (downloadsEnabled.pdf && !resolvedActions.includes(DASHBOARD_ACTION.DOWNLOAD_PDF)) {
    resolvedActions.push(DASHBOARD_ACTION.DOWNLOAD_PDF);
  }

  if (downloadsEnabled.results) {
    if (!resolvedActions.includes("download-results")) {
      resolvedActions.push("download-results");
    }
  }

  return resolvedActions;
}

interface ResolveQuestionModeOptions {
  config: ResolvedDashboardMode["questions"];
  plugins?: MetabasePluginsConfig;
}

export function resolveQuestionMode(options: ResolveQuestionModeOptions): QueryClickActionsMode {
  const { config, plugins } = options;
  
  const hasDrills = config.drilling === true || Array.isArray(config.drilling);
  const availableOnlyDrills = Array.isArray(config.drilling) 
    ? config.drilling.map((drill) => DRILL_TYPE_MAP[drill]).filter(Boolean) as any[]
    : undefined;

  const clickActions = buildClickActions(config.clickActions);
  const fallback = config.fallback === "native-query" ? NativeQueryClickFallback : undefined;

  return {
    name: "dashboard-mode",
    hasDrills,
    availableOnlyDrills,
    clickActions,
    fallback,
  };
}

function buildClickActions(clickActions: any): any[] {
  if (clickActions === true) {
    return Object.values(CLICK_ACTION_MAP);
  }
  
  if (Array.isArray(clickActions)) {
    return clickActions
      .map((action: any) => (CLICK_ACTION_MAP as any)[action])
      .filter(Boolean);
  }
  
  return [];
}

export function resolveNavigation(
  config: ResolvedDashboardMode["questions"]["navigation"],
): ((opts: any) => void) | null {
  if (config === false) {
    return null;
  }

  if (config === true) {
    return (opts) => {
      console.log("Navigate to question:", opts);
    };
  }

  if (typeof config === "object" && config.enabled) {
    if (config.customHandler) {
      return (opts) => config.customHandler!(opts.questionId, opts.filters);
    }

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
