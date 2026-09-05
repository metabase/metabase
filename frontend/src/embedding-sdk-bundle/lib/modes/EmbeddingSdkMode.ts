import { DashboardClickAction } from "metabase/dashboard/click-behavior/DashboardClickAction";
import {
  getClickBehavior,
  getClickBehaviorData,
  getParameterIdValuePairs,
  getParameterValuesBySlug,
} from "metabase/dashboard/click-behavior/dashboard-click-drill";
import type { ParameterIdValuePair } from "metabase/dashboard/click-behavior/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { CombineColumnsAction } from "metabase/querying/click-actions/actions/CombineColumnsAction";
import { ExtractColumnAction } from "metabase/querying/click-actions/actions/ExtractColumnAction";
import { NativeQueryClickFallback } from "metabase/querying/click-actions/actions/NativeQueryClickFallback";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";
import type { ClickObject, LegacyDrill } from "metabase/visualizations/types";
import type { CardId, DashboardId, DashboardTabId } from "metabase-types/api";

export type ClickBehaviorTarget = {
  name: string;
  parameters: ParameterValues;
  /**
   * Same parameter values as {@link parameters}, but keyed by parameter id.
   * Used for same-dashboard click behaviors that need to dispatch per-id
   * setParameterValue actions (mirrors core app DashboardClickAction).
   */
  parameterIdValuePairs: ParameterIdValuePair[];
} & (
  | { type: "dashboard"; id: DashboardId; tabId?: DashboardTabId }
  | { type: "question"; id: CardId }
);

const getClickBehaviorTarget = (
  clicked: ClickObject,
): ClickBehaviorTarget | null => {
  const clickBehavior = getClickBehavior(clicked);
  if (!clickBehavior) {
    return null;
  }

  const { linkType, targetId, extraData, parameterMapping, data, tabId } =
    getClickBehaviorData(clicked, clickBehavior);

  if (
    (linkType !== "dashboard" && linkType !== "question") ||
    targetId == null
  ) {
    return null;
  }

  const parameters = parameterMapping
    ? getParameterValuesBySlug(parameterMapping, {
        data,
        extraData,
        clickBehavior,
      })
    : {};

  const parameterIdValuePairs = parameterMapping
    ? getParameterIdValuePairs(parameterMapping, {
        data,
        extraData,
        clickBehavior,
      })
    : [];

  if (linkType === "dashboard") {
    const dashboard = extraData?.dashboards?.[targetId];

    if (!dashboard) {
      console.warn(
        `[SDK Navigation] Could not find dashboard with id ${targetId}`,
      );
      return null;
    }

    return {
      type: "dashboard",
      id: dashboard.id,
      name: dashboard.name,
      parameters,
      parameterIdValuePairs,
      tabId,
    };
  }

  const question = extraData?.questions?.[targetId];

  if (!question) {
    console.warn(
      `[SDK Navigation] Could not find question with id ${targetId}`,
    );
    return null;
  }

  return {
    type: "question",
    id: question.id,
    name: question.name,
    parameters,
    parameterIdValuePairs,
  };
};

type CreateEmbeddingSdkModeOptions = {
  pushNavigation?: (target: ClickBehaviorTarget) => void;
};

export const createEmbeddingSdkMode = (
  options: CreateEmbeddingSdkModeOptions = {},
): QueryClickActionsMode => {
  const { pushNavigation } = options;

  const SDKDashboardClickAction: LegacyDrill = ({ question, clicked = {} }) => {
    const target = getClickBehaviorTarget(clicked);

    if (target && pushNavigation) {
      return [
        {
          name: "click_behavior",
          defaultAlways: true,
          onClick: () => {
            pushNavigation(target);
          },
        },
      ];
    }

    // Fall back to default behavior if no navigation handler
    return DashboardClickAction({ question, clicked });
  };

  return {
    name: "embedding-sdk",
    hasDrills: true,
    availableOnlyDrills: [
      "drill-thru/column-extract",
      "drill-thru/column-filter",
      "drill-thru/distribution",
      "drill-thru/fk-details",
      "drill-thru/fk-filter",
      "drill-thru/pivot",
      "drill-thru/pk",
      "drill-thru/quick-filter",
      "drill-thru/sort",
      "drill-thru/summarize-column-by-time",
      "drill-thru/summarize-column",
      "drill-thru/underlying-records",
      "drill-thru/zoom-in.binning",
      "drill-thru/zoom-in.geographic",
      "drill-thru/zoom-in.timeseries",
    ],
    clickActions: [
      HideColumnAction,
      SDKDashboardClickAction,
      ExtractColumnAction,
      CombineColumnsAction,
    ],
    fallback: NativeQueryClickFallback,
  };
};

// Keep backwards compat export (without navigation)
export const EmbeddingSdkMode = createEmbeddingSdkMode();
