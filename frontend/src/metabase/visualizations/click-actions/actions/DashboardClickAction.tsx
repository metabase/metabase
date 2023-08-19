import {
  setOrUnsetParameterValues,
  setParameterValue,
} from "metabase/dashboard/actions";
import type {
  ClickObject,
  Drill,
  AlwaysDefaultClickAction,
  AlwaysDefaultClickActionSubAction,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/Question";
import {
  getDashboardDrillLinkUrl,
  getDashboardDrillParameters,
  getDashboardDrillQuestionUrl,
  getDashboardDrillType,
  getDashboardDrillUrl,
} from "metabase-lib/queries/drills/dashboard-click-drill";

type DashboardDrillType =
  | "link-url"
  | "question-url"
  | "dashboard-url"
  | "dashboard-filter"
  | "dashboard-reset";

function getAction(
  type: DashboardDrillType,
  question: Question,
  clicked: ClickObject,
): AlwaysDefaultClickActionSubAction {
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
      return { url: () => getDashboardDrillUrl(clicked) };
    case "dashboard-filter":
      return {
        action: () => {
          const parameterIdValuePairs = getDashboardDrillParameters(clicked);
          return setOrUnsetParameterValues(parameterIdValuePairs);
        },
      };
    case "dashboard-reset":
      return {
        action: () => dispatch => {
          const parameterIdValuePairs = getDashboardDrillParameters(clicked);
          parameterIdValuePairs
            .map(([id, value]) => setParameterValue(id, value))
            .forEach(action => dispatch(action));
        },
      };
  }
}

export const DashboardClickAction: Drill = ({
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
