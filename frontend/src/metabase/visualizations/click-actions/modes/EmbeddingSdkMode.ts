import { getSdkStore } from "embedding-sdk-bundle/store";
import { pushSdkInternalNavigation } from "embedding-sdk-bundle/store/reducer";
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

type ClickBehaviorTarget = {
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

  return target
    ? { type: linkType, id: target.id, name: target.name, parameters }
    : null;
};

export const SDKDashboardClickAction: LegacyDrill = ({
  question,
  clicked = {},
}) => {
  const target = getClickBehaviorTarget(clicked);

  if (target) {
    return [
      {
        name: "click_behavior",
        defaultAlways: true,
        onClick: () => {
          getSdkStore().dispatch(pushSdkInternalNavigation(target));
        },
      },
    ];
  }

  return DashboardClickAction({ question, clicked });
};

export const EmbeddingSdkMode: QueryClickActionsMode = {
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
