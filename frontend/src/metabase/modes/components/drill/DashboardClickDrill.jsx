import { getIn } from "icepick";
import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { setOrUnsetParameterValues } from "metabase/dashboard/dashboard";
import {
  getDataFromClicked,
  getTargetForQueryParams,
  formatSourceForTarget,
} from "metabase/lib/click-behavior";
import { renderLinkURLForClick } from "metabase/lib/formatting/link";

import type {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
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
    return [];
  }
  const { extraData } = clicked || {};
  const data = getDataFromClicked(clicked);
  const { type, linkType, parameterMapping, targetId } = clickBehavior;

  let behavior;

  if (!hasLinkTargetData(clickBehavior, extraData)) {
    return [];
  }

  if (type === "crossfilter") {
    const valuesToSet = _.chain(parameterMapping)
      .values()
      .map(({ source, target, id }) => {
        const value = formatSourceForTarget(source, target, {
          data,
          extraData,
          clickBehavior,
        });
        return [id, value];
      })
      .value();

    behavior = { action: () => setOrUnsetParameterValues(valuesToSet) };
  } else if (type === "link") {
    if (linkType === "url") {
      behavior = {
        url: () =>
          renderLinkURLForClick(clickBehavior.linkTemplate || "", data),
      };
    } else if (linkType === "dashboard") {
      const url = new URL(`/dashboard/${targetId}`, location.href);
      Object.entries(
        getQueryParams(parameterMapping, { data, extraData, clickBehavior }),
      ).forEach(([k, v]) => url.searchParams.append(k, v));

      behavior = { url: () => url.toString() };
    } else if (linkType === "question" && extraData && extraData.questions) {
      let targetQuestion = new Question(
        extraData.questions[targetId],
        question.metadata(),
        getQueryParams(parameterMapping, { data, extraData, clickBehavior }),
      );

      if (targetQuestion.isStructured()) {
        targetQuestion = targetQuestion.setParameters(
          _.chain(parameterMapping)
            .values()
            .map(({ target, id, source }) => ({
              target: target.dimension,
              id,
              type: getTypeForSource(source, extraData),
            }))
            .value(),
        );
      }

      const url = targetQuestion.getUrlWithParameters();
      behavior = { url: () => url };
    }
  }

  return [
    {
      name: "click_behavior",
      defaultAlways: true,
      ...behavior,
    },
  ];
};

function getQueryParams(parameterMapping, { data, extraData, clickBehavior }) {
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

function getTypeForSource(source, extraData) {
  if (source.type === "parameter") {
    const parameters = getIn(extraData, ["dashboard", "parameters"]) || [];
    const { type = "text" } = parameters.find(p => p.id === source.id) || {};
    return type;
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
