import {
  getDashboardDrillLinkUrl,
  getDashboardDrillParameters,
  getDashboardDrillQuestionUrl,
  getDashboardDrillTab,
  getDashboardDrillType,
  getDashboardDrillUrl,
} from "metabase/dashboard/utils/dashboard-click-drill";
import { selectTab } from "metabase/redux/dashboard";
import type { Dispatch } from "metabase/redux/store";
import type {
  AlwaysDefaultClickAction,
  AlwaysDefaultClickActionSubAction,
  ClickObject,
  LegacyDrill,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { ParameterValueOrArray } from "metabase-types/api";

type DashboardDrillType =
  | "link-url"
  | "question-url"
  | "dashboard-url"
  | "dashboard-filter"
  | "dashboard-reset";

type SetOrUnsetParameterValues = (
  parameterIdValuePairs: [string, ParameterValueOrArray | null][],
) => (dispatch: Dispatch) => void;

type SetParameterValue = (
  id: string,
  value: ParameterValueOrArray | null,
) => (dispatch: Dispatch) => void;

function getAction(
  type: DashboardDrillType,
  question: Question,
  clicked: ClickObject,
): AlwaysDefaultClickActionSubAction {
  // These are injected via extraData by the dashboard's useClickBehaviorData hook.
  // They are guaranteed to be present in dashboard context where
  // "dashboard-filter" and "dashboard-reset" drill types are produced.
  const setOrUnsetParameterValues = clicked.extraData
    ?.setOrUnsetParameterValues as SetOrUnsetParameterValues;
  const setParameterValue = clicked.extraData
    ?.setParameterValue as SetParameterValue;

  switch (type) {
    case "link-url":
      return {
        ignoreSiteUrl: true,
        url: () => getDashboardDrillLinkUrl(clicked),
      };
    case "question-url":
      return {
        url: () => getDashboardDrillQuestionUrl(question, clicked),
      };
    case "dashboard-url":
      return {
        url: () => getDashboardDrillUrl(clicked),
      };
    case "dashboard-filter":
      return {
        action: () => {
          const parameterIdValuePairs = getDashboardDrillParameters(
            clicked,
          ) as [string, ParameterValueOrArray | null][];
          return setOrUnsetParameterValues(parameterIdValuePairs);
        },
      };
    case "dashboard-reset":
      return {
        action: () => (dispatch: Dispatch) => {
          const tabId = getDashboardDrillTab(clicked);

          if (tabId) {
            dispatch(selectTab({ tabId }));
          }

          const parameterIdValuePairs = getDashboardDrillParameters(
            clicked,
          ) as [string, ParameterValueOrArray | null][];
          parameterIdValuePairs
            .map(([id, value]) => setParameterValue(id, value))
            .forEach((action) => dispatch(action));
        },
      };
  }
}

export const DashboardClickAction: LegacyDrill = ({
  question,
  clicked = {},
}): AlwaysDefaultClickAction[] => {
  const type = getDashboardDrillType(clicked);
  if (!type) {
    return [];
  }

  return [
    {
      name: "click_behavior",
      defaultAlways: true,
      ...getAction(type, question, clicked),
    },
  ];
};
