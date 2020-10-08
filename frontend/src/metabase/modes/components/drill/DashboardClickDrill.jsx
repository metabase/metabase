/* @flow weak */
import { getIn } from "icepick";
import _ from "underscore";

import { isDate } from "metabase/lib/schema_metadata";
import { parseTimestamp } from "metabase/lib/time";
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
      target.id,
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

function formatSourceForTarget(
  source,
  target,
  { data, extraData, clickBehavior },
) {
  const datum = data[source.type][source.id.toLowerCase()] || [];
  if (datum.column && isDate(datum.column)) {
    if (target.type === "parameter") {
      // we should serialize differently based on the target parameter type
      const parameterPath =
        clickBehavior.type === "crossfilter"
          ? ["dashboard", "parameters"]
          : ["dashboards", clickBehavior.targetId, "parameters"];
      const parameters = getIn(extraData, parameterPath) || [];
      const parameter = parameters.find(p => p.id === target.id);
      if (parameter) {
        return formatDateForParameterType(datum.value, parameter.type);
      }
    } else {
      // If the target is a dimension or variable,, we serialize as a date to remove the timestamp.
      // TODO: provide better serialization for field filter widget types
      return formatDateForParameterType(datum.value, "date/single");
    }
  }
  return datum.value;
}

function formatDateForParameterType(value, parameterType) {
  const m = parseTimestamp(value);
  if (!m.isValid()) {
    return String(value);
  }
  if (parameterType === "date/month-year") {
    return m.format("YYYY-MM");
  } else if (parameterType === "date/quarter-year") {
    return m.format("[Q]Q-YYYY");
  } else if (
    parameterType === "date/single" ||
    parameterType === "date/all-options"
  ) {
    return m.format("YYYY-MM-DD");
  }
  return value;
}
