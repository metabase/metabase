import { push } from "react-router-redux";
import {
  setOrUnsetParameterValues,
  setParameterValue,
} from "metabase/dashboard/actions";
import {
  getDashboardDrillLinkUrl,
  getDashboardDrillPageUrl,
  getDashboardDrillParameters,
  getDashboardDrillQuestionUrl,
  getDashboardDrillType,
  getDashboardDrillUrl,
} from "metabase-lib/lib/queries/drills/dashboard-click-drill";

function getAction(type, question, clicked) {
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
    case "page-url":
      return { action: () => push(getDashboardDrillPageUrl(clicked)) };
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

export default ({ question, clicked }) => {
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
