import querystring from "querystring";

import { getIn } from "icepick";
import _ from "underscore";

import {
  formatSourceForTarget,
  getDataFromClicked,
  getTargetForQueryParams,
} from "metabase/parameters/utils/click-behavior";
import * as Urls from "metabase/urls";
import { renderLinkURLForClick } from "metabase/visualizations/lib/formatting/link";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getObjectColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { isDate } from "metabase-lib/v1/types/utils/isa";

import { getStructuredQuestionUrlWithParameters } from "./question-url";

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

  const targetDashboard = extraData.dashboards[targetId];
  const targetDefaultParameters = Object.fromEntries(
    targetDashboard.parameters.map((parameter) => [
      parameter.slug,
      parameter.default ?? "",
    ]),
  );

  const baseQueryParams = getParameterValuesBySlug(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });

  const tabParams =
    typeof clickBehavior.tabId === "undefined"
      ? {}
      : { tab: clickBehavior.tabId };

  const queryParams = {
    ...targetDefaultParameters,
    ...baseQueryParams,
    ...tabParams,
  };

  const path = Urls.dashboard({ id: targetId });
  return `${path}?${querystring.stringify(queryParams)}`;
}

export function getDashboardDrillQuestionUrl(question, clicked) {
  const clickBehavior = getClickBehavior(clicked);
  const { data, extraData, parameterMapping, targetId } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  const baseQuestion = new Question(
    extraData.questions[targetId],
    question.metadata(),
  ).lockDisplay();
  const targetQuestion =
    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
    baseQuestion.display() === "pivot"
      ? baseQuestion
      : baseQuestion.setQuery(Lib.ensureFilterStage(baseQuestion.query()));

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
  const originalQuestion = targetQuestion;

  return !isTargetQuestionNative
    ? getStructuredQuestionUrlWithParameters(
        targetQuestion,
        originalQuestion,
        parameters,
        queryParams,
      )
    : Urls.question(targetQuestion, { query: queryParams });
}

export function getClickBehavior(clicked) {
  const settings = (clicked && clicked.settings) || {};
  const columnClickBehavior = getColumnClickBehavior(settings, clicked?.column);
  if (columnClickBehavior) {
    return columnClickBehavior;
  }

  const dimensionClickBehavior = (clicked?.dimensions || [])
    .map((dimension) => getColumnClickBehavior(settings, dimension.column))
    .find(Boolean);

  return dimensionClickBehavior || settings.click_behavior;
}

function getColumnClickBehavior(settings, column) {
  if (!column) {
    return undefined;
  }
  return (
    getObjectColumnSettings(settings.column_settings, column)?.click_behavior ??
    settings.column?.(column)?.click_behavior
  );
}

export function getClickBehaviorData(clicked, clickBehavior) {
  const data = getDataFromClicked(clicked);
  const { type, linkType, parameterMapping, tabId, targetId } = clickBehavior;
  const { extraData } = clicked || {};

  return { type, linkType, data, extraData, parameterMapping, tabId, targetId };
}

export function getParameterIdValuePairs(
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

export function getParameterValuesBySlug(
  parameterMapping,
  { data, extraData, clickBehavior },
) {
  return Object.fromEntries(
    Object.values(parameterMapping)
      .map(({ source, target }) => [
        getTargetForQueryParams(target, { extraData, clickBehavior }),
        formatSourceForTarget(source, target, {
          data,
          extraData,
          clickBehavior,
        }),
      ])
      .filter(([key, value]) => key != null && value != null),
  );
}

function getTypeForSource(source, data, extraData) {
  if (source.type === "parameter") {
    const parameters = getIn(extraData, ["dashboard", "parameters"]) || [];
    const { type = "text" } = parameters.find((p) => p.id === source.id) || {};
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
