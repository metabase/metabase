import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import {
  getClickBehavior,
  getClickBehaviorData,
  getParameterValuesBySlug,
} from "metabase-lib/v1/queries/drills/dashboard-click-drill";

import type {
  ClickObject,
  LegacyDrill,
  QueryClickActionsMode,
} from "../../types";
import { CombineColumnsAction } from "../actions/CombineColumnsAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { ExtractColumnAction } from "../actions/ExtractColumnAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export type ClickBehaviorTarget = {
  type: "dashboard" | "question";
  id: number;
  name: string;
  parameters: ParameterValues;
};

const getClickBehaviorTarget = (
  clicked: ClickObject,
): ClickBehaviorTarget | null => {
  const clickBehavior = getClickBehavior(clicked);
  if (!clickBehavior) {
    return null;
  }

  const { linkType, targetId, extraData, parameterMapping, data } =
    getClickBehaviorData(clicked, clickBehavior);

  if (linkType !== "dashboard" && linkType !== "question") {
    return null;
  }

  const parameters = parameterMapping
    ? getParameterValuesBySlug(parameterMapping, {
        data,
        extraData,
        clickBehavior,
      })
    : {};

  const entitiesMap =
    linkType === "dashboard" ? extraData?.dashboards : extraData?.questions;
  const target = entitiesMap?.[targetId];

  if (!target) {
    console.warn(
      `[SDK Navigation] Could not find ${linkType} with id ${targetId}`,
    );
    return null;
  }

  return { type: linkType, id: target.id, name: target.name, parameters };
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
