import _ from "underscore";
import { getIn } from "icepick";
import { t, ngettext, msgid } from "ttag";

import { isDate } from "metabase/lib/schema_metadata";
import { parseTimestamp } from "metabase/lib/time";
import { formatDateTimeForParameter } from "metabase/lib/formatting/date";
import Question from "metabase-lib/lib/Question";
import { TemplateTagVariable } from "metabase-lib/lib/Variable";
import { TemplateTagDimension } from "metabase-lib/lib/Dimension";
import { isa, TYPE } from "metabase/lib/types";
import {
  dimensionFilterForParameter,
  variableFilterForParameter,
} from "metabase/parameters/utils/filters";

export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug, userAttributes } = {},
  dimensions = [],
  data = [],
}) {
  const column = [
    ...dimensions,
    ...data.map(d => ({
      column: d.col,
      // When the data is changed to a display value for use in tooltips, we can set clickBehaviorValue to the raw value for filtering.
      value: d.clickBehaviorValue || d.value,
    })),
  ]
    .filter(d => d.column != null)
    .reduce(
      (acc, { column, value }) =>
        acc[name] === undefined
          ? { ...acc, [column.name.toLowerCase()]: { value, column } }
          : acc,
      {},
    );

  const parameterByName =
    dashboard == null
      ? {}
      : _.chain(dashboard.parameters)
          .filter(p => parameterValuesBySlug[p.slug] != null)
          .map(p => [
            p.name.toLowerCase(),
            { value: parameterValuesBySlug[p.slug] },
          ])
          .object()
          .value();

  const parameterBySlug = _.mapObject(parameterValuesBySlug, value => ({
    value,
  }));

  const parameter =
    dashboard == null
      ? {}
      : _.chain(dashboard.parameters)
          .filter(p => parameterValuesBySlug[p.slug] != null)
          .map(p => [p.id, { value: parameterValuesBySlug[p.slug] }])
          .object()
          .value();

  const userAttribute = _.mapObject(userAttributes, value => ({ value }));

  return { column, parameter, parameterByName, parameterBySlug, userAttribute };
}

const { Text, Number, Temporal } = TYPE;

function notRelativeDateOrRange({ type }) {
  return type !== "date/range" && type !== "date/relative";
}

export function getTargetsWithSourceFilters({
  isDash,
  isAction,
  dashcard,
  object,
  metadata,
}) {
  if (isAction) {
    return getTargetsForAction(object);
  }
  return isDash
    ? getTargetsForDashboard(object, dashcard)
    : getTargetsForQuestion(object, metadata);
}

function getTargetsForAction(action) {
  const parameters = Object.values(action.parameters);
  return parameters.map(parameter => {
    const { id, name } = parameter;
    return {
      id,
      name,
      target: { type: "parameter", id },

      // We probably don't want to allow everything
      // and will need to add some filters eventually
      sourceFilters: {
        column: () => true,
        parameter: () => true,
        userAttribute: () => true,
      },
    };
  });
}

function getTargetsForQuestion(question, metadata) {
  const query = new Question(question, metadata).query();
  return query
    .dimensionOptions()
    .all()
    .concat(query.variables())
    .map(o => {
      let id, target;
      if (
        o instanceof TemplateTagVariable ||
        o instanceof TemplateTagDimension
      ) {
        let name;
        ({ id, name } = o.tag());
        target = { type: "variable", id: name };
      } else {
        const dimension = ["dimension", o.mbql()];
        id = JSON.stringify(dimension);
        target = { type: "dimension", id, dimension };
      }
      let parentType;
      let parameterSourceFilter = () => true;
      const columnSourceFilter = c => isa(c.base_type, parentType);
      if (o instanceof TemplateTagVariable) {
        parentType = { text: Text, number: Number, date: Temporal }[
          o.tag().type
        ];
        parameterSourceFilter = parameter =>
          variableFilterForParameter(parameter)(o);
      } else if (o.field() != null) {
        const { base_type } = o.field();
        parentType =
          [Temporal, Number, Text].find(t => isa(base_type, t)) || base_type;
        parameterSourceFilter = parameter =>
          dimensionFilterForParameter(parameter)(o);
      }

      return {
        id,
        target,
        name: o.displayName({ includeTable: true }),
        sourceFilters: {
          column: columnSourceFilter,
          parameter: parameterSourceFilter,
          userAttribute: () => parentType === Text,
        },
      };
    });
}

function getTargetsForDashboard(dashboard, dashcard) {
  return dashboard.parameters.map(parameter => {
    const { type, id, name } = parameter;
    const filter = baseTypeFilterForParameterType(type);
    return {
      id,
      name,
      target: { type: "parameter", id },
      sourceFilters: {
        column: c => notRelativeDateOrRange(parameter) && filter(c.base_type),
        parameter: sourceParam => {
          // parameter IDs are generated client-side, so they might not be unique
          // if dashboard is a clone, it will have identical parameter IDs to the original
          const isSameParameter =
            dashboard.id === dashcard.dashboard_id &&
            parameter.id === sourceParam.id;
          return parameter.type === sourceParam.type && !isSameParameter;
        },
        userAttribute: () => !parameter.type.startsWith("date"),
      },
    };
  });
}

function baseTypeFilterForParameterType(parameterType) {
  const [typePrefix] = parameterType.split("/");
  const allowedTypes = {
    date: [TYPE.Temporal],
    id: [TYPE.Integer, TYPE.UUID],
    category: [TYPE.Text, TYPE.Integer],
    location: [TYPE.Text],
  }[typePrefix];
  if (allowedTypes === undefined) {
    // default to showing everything
    return () => true;
  }
  return baseType =>
    allowedTypes.some(allowedType => isa(baseType, allowedType));
}

export function getClickBehaviorDescription(dashcard) {
  const noBehaviorMessage = hasActionsMenu(dashcard)
    ? t`Open the action menu`
    : t`Do nothing`;
  if (isTableDisplay(dashcard)) {
    const count = Object.values(
      getIn(dashcard, ["visualization_settings", "column_settings"]) || {},
    ).filter(settings => settings.click_behavior != null).length;
    if (count === 0) {
      return noBehaviorMessage;
    }
    return ngettext(
      msgid`${count} column has custom behavior`,
      `${count} columns have custom behavior`,
      count,
    );
  }
  const { click_behavior: clickBehavior } = dashcard.visualization_settings;
  if (clickBehavior == null) {
    return noBehaviorMessage;
  }
  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;
    return linkType == null
      ? t`Go to...`
      : linkType === "dashboard"
      ? t`Go to dashboard`
      : linkType === "question"
      ? t`Go to question`
      : t`Go to url`;
  }

  return t`Filter this dashboard`;
}

export function clickBehaviorIsValid(clickBehavior) {
  // opens action menu
  if (clickBehavior == null) {
    return true;
  }
  const {
    type,
    parameterMapping = {},
    linkType,
    targetId,
    linkTemplate,
  } = clickBehavior;
  if (type === "crossfilter") {
    return Object.keys(parameterMapping).length > 0;
  }
  // if it's not a crossfilter/action, it's a link
  if (linkType === "url") {
    return (linkTemplate || "").length > 0;
  }
  // if we're linking to a question or dashboard we just need a targetId
  if (linkType === "dashboard" || linkType === "question") {
    return targetId != null;
  }
  // we've picked "link" without picking a link type
  return false;
}

export function hasActionsMenu(dashcard) {
  // This seems to work, but it isn't the right logic.
  // The right thing to do would be to check for any drills. However, we'd need a "clicked" object for that.
  return getIn(dashcard, ["card", "dataset_query", "type"]) !== "native";
}

export function isTableDisplay(dashcard) {
  return dashcard.card.display === "table";
}

export function formatSourceForTarget(
  source,
  target,
  { data, extraData, clickBehavior },
) {
  const datum = data[source.type][source.id.toLowerCase()] || [];
  if (datum.column && isDate(datum.column)) {
    if (target.type === "parameter") {
      // we should serialize differently based on the target parameter type
      const parameter = getParameter(target, { extraData, clickBehavior });
      if (parameter) {
        return formatDateForParameterType(
          datum.value,
          parameter.type,
          datum.column.unit,
        );
      }
    } else {
      // If the target is a dimension or variable,, we serialize as a date to remove the timestamp.
      // TODO: provide better serialization for field filter widget types
      return formatDateForParameterType(datum.value, "date/single");
    }
  }
  return datum.value;
}

function formatDateForParameterType(value, parameterType, unit) {
  const m = parseTimestamp(value);
  if (!m.isValid()) {
    return String(value);
  }
  if (parameterType === "date/month-year") {
    return m.format("YYYY-MM");
  } else if (parameterType === "date/quarter-year") {
    return m.format("[Q]Q-YYYY");
  } else if (parameterType === "date/single") {
    return m.format("YYYY-MM-DD");
  } else if (parameterType === "date/all-options") {
    return formatDateTimeForParameter(value, unit);
  }
  return value;
}

export function getTargetForQueryParams(target, { extraData, clickBehavior }) {
  if (target.type === "parameter") {
    const parameter = getParameter(target, { extraData, clickBehavior });
    return parameter && parameter.slug;
  }
  return target.id;
}

function getParameter(target, { extraData, clickBehavior }) {
  const parameterPath =
    clickBehavior.type === "crossfilter"
      ? ["dashboard", "parameters"]
      : ["dashboards", clickBehavior.targetId, "parameters"];
  const parameters = getIn(extraData, parameterPath) || [];
  return parameters.find(p => p.id === target.id);
}
