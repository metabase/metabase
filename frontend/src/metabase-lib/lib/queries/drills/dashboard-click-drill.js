import { getIn } from "icepick";
import * as Urls from "metabase/lib/urls";

export function dashboardClickDrill({ clicked }) {
  const type = dashboardClickDrillType({ clicked });
  if (!type) {
    return null;
  }

  return { type };
}

function dashboardClickDrillType({ clicked }) {
  const settings = (clicked && clicked.settings) || {};
  const columnSettings =
    (clicked &&
      clicked.column &&
      settings.column &&
      settings.column(clicked.column)) ||
    {};

  const clickBehavior =
    columnSettings.click_behavior || settings.click_behavior;
  if (clickBehavior == null) {
    return null;
  }

  const { extraData } = clicked || {};
  if (!hasLinkTargetData(clickBehavior, extraData)) {
    return null;
  }

  const { type, linkType, targetId } = clickBehavior;
  if (type === "crossfilter") {
    return "dashboard-toggle-parameters";
  } else if (type === "link") {
    if (linkType === "url") {
      return "link";
    } else if (linkType === "dashboard") {
      if (extraData.dashboard.id === targetId) {
        return "dashboard-set-parameters";
      } else {
        return "dashboard-url";
      }
    } else if (linkType === "page") {
      const { location, routerParams } = extraData;

      const isInDataApp =
        Urls.isDataAppPagePath(location.pathname) ||
        Urls.isDataAppPath(location.pathname);
      if (!isInDataApp) {
        return null;
      }

      const dataAppId = Urls.extractEntityId(routerParams.slug);
      if (!dataAppId) {
        return null;
      }

      return "page";
    } else if (linkType === "question" && extraData && extraData.questions) {
      return "question";
    }
  }

  return null;
}

function hasLinkTargetData(clickBehavior, extraData) {
  const { linkType, targetId } = clickBehavior;
  if (linkType === "question") {
    return getIn(extraData, ["questions", targetId]) != null;
  } else if (linkType === "dashboard") {
    return getIn(extraData, ["dashboards", targetId]) != null;
  }
  return true;
}
