/* @flow weak */

import { push } from "react-router-redux";
import { getIn } from "icepick";
import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { setOrUnsetParameterValues } from "metabase/dashboard/dashboard";
import { getDataFromClicked } from "metabase/lib/click-behavior";
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
  if (type === "crossfilter") {
    const valuesToSet = _.chain(parameterMapping)
      .values()
      .map(({ source, id }) => {
        const { value } = data[source.type][source.id.toLowerCase()] || {};
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
      const pathname = `/dashboard/${targetId}`;
      const query = getQueryParams(parameterMapping, data);
      behavior = { action: () => push({ pathname, query }) };
    } else if (linkType === "question" && extraData && extraData.questions) {
      let targetQuestion = new Question(
        extraData.questions[targetId],
        question.metadata(),
        getQueryParams(parameterMapping, data),
      );

      if (targetQuestion.isStructured()) {
        targetQuestion = targetQuestion.setParameters(
          _.chain(parameterMapping)
            .values()
            .map(({ target, id, source }) => ({
              target,
              id,
              type: getTypeForSource(source, extraData),
            }))
            .value(),
        );
      }

      const url = targetQuestion.getUrlWithParameters();
      behavior = { action: () => push(url) };
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

function getQueryParams(parameterMapping, data) {
  return _.chain(parameterMapping)
    .values()
    .map(({ source, target }) => {
      const { value } = data[source.type][source.id.toLowerCase()] || [];
      const key = typeof target === "string" ? target : JSON.stringify(target);
      return [key, value];
    })
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
