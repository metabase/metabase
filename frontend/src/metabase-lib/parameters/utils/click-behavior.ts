import _ from "underscore";
import { getIn } from "icepick";

import type {
  ClickBehavior,
  Dashboard,
  DashboardCard,
  DatetimeUnit,
  Parameter,
  ParameterType,
  ParameterValueOrArray,
  UserAttribute,
} from "metabase-types/api";
import { isImplicitActionClickBehavior } from "metabase-types/guards";
import type { ValueAndColumnForColumnNameDate } from "metabase/lib/formatting/link";
import { parseTimestamp } from "metabase/lib/time";
import {
  formatDateTimeForParameter,
  formatDateToRangeForParameter,
} from "metabase/lib/formatting/date";
import {
  dimensionFilterForParameter,
  variableFilterForParameter,
} from "metabase-lib/parameters/utils/filters";
import type { Dimension } from "metabase-lib/types";
import { isa, isDate } from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";
import { TemplateTagDimension } from "metabase-lib/Dimension";
import type Question from "metabase-lib/Question";
import type { ClickObjectDataRow } from "metabase-lib/queries/drills/types";

export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug = {}, userAttributes } = {},
  dimensions = [],
  data = [],
}: {
  extraData?: {
    dashboard?: Dashboard;
    parameterValuesBySlug?: Record<string, ParameterValueOrArray>;
    userAttributes?: UserAttribute[] | null;
  };
  dimensions: Dimension[];
  data: (ClickObjectDataRow & {
    clickBehaviorValue: ClickObjectDataRow["value"];
  })[];
}): ValueAndColumnForColumnNameDate {
  const column = [
    ...dimensions,
    ...data.map(d => ({
      column: d.col,
      // When the data is changed to a display value for use in tooltips, we can set clickBehaviorValue to the raw value for filtering.
      value: d.clickBehaviorValue || d.value,
    })),
  ]
    .filter(d => d.column != null)
    .reduce<ValueAndColumnForColumnNameDate["column"]>(
      (acc, { column, value }) => {
        if (!column) {
          return acc;
        }

        const name = column.name.toLowerCase();

        if (acc[name] === undefined) {
          return { ...acc, [name]: { value, column } };
        }

        return acc;
      },
      {},
    );

  const dashboardParameters = (dashboard?.parameters || []).filter(
    ({ slug }) => parameterValuesBySlug[slug] != null,
  );

  const parameterByName =
    dashboard == null
      ? {}
      : Object.fromEntries(
          dashboardParameters.map(({ name, slug }) => [
            name.toLowerCase(),
            { value: parameterValuesBySlug[slug] },
          ]),
        );

  const parameterBySlug = _.mapObject(parameterValuesBySlug, value => ({
    value,
  }));

  const parameter =
    dashboard == null
      ? {}
      : Object.fromEntries(
          dashboardParameters.map(({ id, slug }) => [
            id,
            { value: parameterValuesBySlug[slug] },
          ]),
        );

  const userAttribute = Object.fromEntries(
    (userAttributes || []).map(value => [value, { value }]),
  );

  return { column, parameter, parameterByName, parameterBySlug, userAttribute };
}

const { Text, Number, Temporal } = TYPE;

function notRelativeDateOrRange({ type }: Parameter) {
  return type !== "date/range" && type !== "date/relative";
}

export function getTargetsForQuestion(question: Question): Target[] {
  const query = question.query();
  return [...query.dimensionOptions().all(), ...query.variables()].map(o => {
    let id, target;
    if (o instanceof TemplateTagVariable || o instanceof TemplateTagDimension) {
      let name;
      ({ id, name } = o.tag());
      target = { type: "variable", id: name };
    } else {
      const dimension = ["dimension", o.mbql()];
      id = JSON.stringify(dimension);
      target = { type: "dimension", id, dimension };
    }
    let parentType;
    let parameterSourceFilter: SourceFilters["parameter"] = () => true;
    const columnSourceFilter = c => isa(c.base_type, parentType);
    if (o instanceof TemplateTagVariable) {
      parentType = { text: Text, number: Number, date: Temporal }[o.tag().type];
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

interface SourceFilters {
  column: (column: Column) => boolean;
  parameter: (parameter: Parameter) => boolean;
  userAttribute: (userAttribute) => boolean;
}

interface ParameterTarget {
  type: "parameter";
  id: Parameter["id"];
}

interface Target {
  id: Parameter["id"];
  name: Parameter["name"];
  target: ParameterTarget;
  sourceFilters: SourceFilters;
}

export function getTargetsForDashboard(
  dashboard: Dashboard,
  dashcard: DashboardCard,
): Target[] {
  if (!dashboard.parameters) {
    return [];
  }

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

function baseTypeFilterForParameterType(parameterType: string) {
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
  return (baseType: string) =>
    allowedTypes.some(allowedType => isa(baseType, allowedType));
}

export function clickBehaviorIsValid(
  clickBehavior: ClickBehavior | undefined | null,
): boolean {
  // opens drill-through menu
  if (clickBehavior == null) {
    return true;
  }

  if (clickBehavior.type === "crossfilter") {
    return Object.keys(clickBehavior.parameterMapping || {}).length > 0;
  }

  if (clickBehavior.type === "action") {
    return isImplicitActionClickBehavior(clickBehavior);
  }

  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;

    // if it's not a crossfilter/action, it's a link
    if (linkType === "url") {
      return (clickBehavior.linkTemplate || "").length > 0;
    }

    // if we're linking to a Metabase entity we just need a targetId
    if (linkType === "dashboard" || linkType === "question") {
      return clickBehavior.targetId != null;
    }
  }

  // we've picked "link" without picking a link type
  return false;
}

export function formatSourceForTarget(
  source,
  target,
  { data, extraData, clickBehavior },
): string {
  const datum = data[source.type][source.id.toLowerCase()] || [];
  if (datum.column && isDate(datum.column)) {
    const sourceDateUnit = datum.column.unit;

    if (target.type === "parameter") {
      // we should serialize differently based on the target parameter type
      const parameter = getParameter(target, { extraData, clickBehavior });
      if (parameter) {
        return formatDateForParameterType(
          datum.value,
          parameter.type,
          sourceDateUnit,
        );
      }
    } else {
      // If the target is a dimension or variable, we serialize as a date to remove the timestamp

      if (["week", "month", "quarter", "year"].includes(sourceDateUnit)) {
        return formatDateToRangeForParameter(datum.value, sourceDateUnit);
      }

      return formatDateForParameterType(
        datum.value,
        "date/single",
        sourceDateUnit,
      );
    }
  }

  return datum.value;
}

function formatDateForParameterType(
  value: string,
  parameterType: ParameterType,
  unit: DatetimeUnit,
): string {
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
