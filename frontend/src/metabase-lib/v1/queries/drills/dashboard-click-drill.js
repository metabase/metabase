import { getIn } from "icepick";
import querystring from "querystring";
import _ from "underscore";

import { renderLinkURLForClick } from "metabase/lib/formatting/link";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  formatSourceForTarget,
  getDataFromClicked,
  getTargetForQueryParams,
} from "metabase-lib/v1/parameters/utils/click-behavior";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import * as ML_Urls from "metabase-lib/v1/urls";

export function getDashboardDrillType(clicked) {
  const clickBehavior = getClickBehavior(clicked);
  if (clickBehavior == null) {
    return null;
  }

  const { type, linkType, targetId, extraData } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );
  if (!hasLinkTargetData(clickBehavior, extraData)) {
    return null;
  }

  if (type === "crossfilter") {
    return "dashboard-filter";
  } else if (type === "link") {
    if (linkType === "url") {
      return "link-url";
    } else if (linkType === "dashboard") {
      if (extraData.dashboard.id === targetId) {
        return "dashboard-reset";
      } else {
        return "dashboard-url";
      }
    } else if (linkType === "question" && extraData && extraData.questions) {
      return "question-url";
    }
  }

  return null;
}

export function getDashboardDrillTab(clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { tabId } = getClickBehaviorData(clicked, clickBehavior);

  return tabId;
}

export function getDashboardDrillParameters(clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { data, parameterMapping, extraData } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  return getParameterIdValuePairs(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });
}

export function getDashboardDrillLinkUrl(clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { data } = getClickBehaviorData(clicked, clickBehavior);

  return renderLinkURLForClick(clickBehavior.linkTemplate || "", data);
}

export function getDashboardDrillUrl(clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { data, extraData, parameterMapping, targetId } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  const baseQueryParams = getParameterValuesBySlug(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });

  const queryParams =
    typeof clickBehavior.tabId === "undefined"
      ? baseQueryParams
      : { ...baseQueryParams, tab: clickBehavior.tabId };

  const path = Urls.dashboard({ id: targetId });
  return `${path}?${querystring.stringify(queryParams)}`;
}

export function getDashboardDrillQuestionUrl(question, clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { data, extraData, parameterMapping, targetId } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  const targetQuestion = new Question(
    extraData.questions[targetId],
    question.metadata(),
  ).lockDisplay();

  const parameters = _.chain(parameterMapping)
    .values()
    .map(({ target, id, source }) => ({
      target: target.dimension,
      id,
      slug: id,
      type: getTypeForSource(source, data, extraData),
    }))
    .value();

  const queryParams = getParameterValuesBySlug(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });

  const isTargetQuestionNative = Lib.queryDisplayInfo(
    targetQuestion.query(),
  ).isNative;

  return !isTargetQuestionNative
    ? ML_Urls.getUrlWithParameters(targetQuestion, parameters, queryParams)
    : `${ML_Urls.getUrl(targetQuestion)}?${querystring.stringify(queryParams)}`;
}

function getClickBehavior(clicked) {
  const settings = (clicked && clicked.settings) || {};
  const columnSettings =
    (clicked &&
      clicked.column &&
      settings.column &&
      settings.column(clicked.column)) ||
    {};

  return columnSettings.click_behavior || settings.click_behavior;
}

function getClickBehaviorData(clicked, clickBehavior) {
  const data = getDataFromClicked(clicked);
  const { type, linkType, parameterMapping, tabId, targetId } = clickBehavior;
  const { extraData } = clicked || {};

  return { type, linkType, data, extraData, parameterMapping, tabId, targetId };
}

function getParameterIdValuePairs(
  parameterMapping,
  { data, extraData, clickBehavior },
) {
  return _.values(parameterMapping).map(({ source, target, id }) => {
    return [
      id,
      formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      }),
    ];
  });
}

function getParameterValuesBySlug(
  parameterMapping,
  { data, extraData, clickBehavior },
) {
  return _.chain(parameterMapping)
    .values()
    .map(({ source, target }) => [
      getTargetForQueryParams(target, { extraData, clickBehavior }),
      formatSourceForTarget(source, target, { data, extraData, clickBehavior }),
    ])
    .filter(([key, value]) => value != null)
    .object()
    .value();
}

function getTypeForSource(source, data, extraData) {
  if (source.type === "parameter") {
    const parameters = getIn(extraData, ["dashboard", "parameters"]) || [];
    const { type = "text" } = parameters.find(p => p.id === source.id) || {};
    return type;
  }

  const datum = data[source.type][source.id.toLowerCase()] || [];
  if (datum.column && isDate(datum.column)) {
    return "date";
  }

  return "text";
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
