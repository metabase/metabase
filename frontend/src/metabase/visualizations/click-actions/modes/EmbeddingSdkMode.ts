import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DashboardTabId, ParameterValueOrArray } from "metabase-types/api";

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
import {
  getClickBehavior,
  getClickBehaviorData,
  getDashboardDrillQuestionUrl,
  getParameterIdValuePairs,
  getParameterValuesBySlug,
} from "../lib/dashboard-click-drill";

export type ClickBehaviorTarget =
  | {
      type: "dashboard" | "question";
      id: number;
      name: string;
      parameters: ParameterValues;
      /**
       * Same parameter values as {@link parameters}, but keyed by parameter id.
       * Used for same-dashboard click behaviors that need to dispatch per-id
       * setParameterValue actions (mirrors core app DashboardClickAction).
       */
      parameterIdValuePairs: [string, ParameterValueOrArray | null][];
      tabId?: DashboardTabId;
    }
  | {
      /**
       * A non-native target question. The mapped values are already encoded as
       * filters in the path, so there are no parameters left to carry.
       */
      type: "ad-hoc-question";
      name: string;
      adHocQuestionPath: string;
    };

export const getClickBehaviorTarget = (
  clicked: ClickObject,
  question: Question,
): ClickBehaviorTarget | null => {
  const clickBehavior = getClickBehavior(clicked);
  if (!clickBehavior) {
    return null;
  }

  const { linkType, targetId, extraData, parameterMapping, data, tabId } =
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

  const parameterIdValuePairs = (
    parameterMapping
      ? getParameterIdValuePairs(parameterMapping, {
          data,
          extraData,
          clickBehavior,
        })
      : []
  ) as [string, ParameterValueOrArray | null][];

  const entitiesMap =
    linkType === "dashboard" ? extraData?.dashboards : extraData?.questions;
  const target = entitiesMap?.[targetId];

  if (!target) {
    console.warn(
      `[SDK Navigation] Could not find ${linkType} with id ${targetId}`,
    );
    return null;
  }

  if (linkType === "question") {
    const targetQuestion = new Question(target, question.metadata());
    const isTargetQuestionNative = Lib.queryDisplayInfo(
      targetQuestion.query(),
    ).isNative;

    // Only a native question's template tags can consume the mapped values, so a
    // non-native target is opened as an ad-hoc, pre-filtered question instead.
    if (!isTargetQuestionNative) {
      return {
        type: "ad-hoc-question",
        name: target.name,
        adHocQuestionPath: getDashboardDrillQuestionUrl(question, clicked),
      };
    }
  }

  return {
    type: linkType,
    id: target.id,
    name: target.name,
    parameters,
    parameterIdValuePairs,
    tabId,
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
    const target = getClickBehaviorTarget(clicked, question);

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
