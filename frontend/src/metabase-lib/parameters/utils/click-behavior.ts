import _ from "underscore";

import type {
  ClickBehavior,
  ClickBehaviorDimensionTarget,
  ClickBehaviorSource,
  ClickBehaviorTarget,
  Dashboard,
  DashboardCard,
  DashboardId,
  DatasetColumn,
  DatetimeUnit,
  Parameter,
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
import type { ClickObjectDimension as DimensionType } from "metabase-lib/types";
import { isa, isDate } from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";
import { TemplateTagDimension } from "metabase-lib/Dimension";
import type Question from "metabase-lib/Question";
import type { ClickObjectDataRow } from "metabase-lib/queries/drills/types";

interface Target {
  id: Parameter["id"];
  name: Parameter["name"] | null | undefined;
  target: ClickBehaviorTarget;
  sourceFilters: SourceFilters;
}

interface SourceFilters {
  column: (column: DatasetColumn) => boolean;
  parameter: (parameter: Parameter) => boolean;
  userAttribute: (userAttribute: string) => boolean;
}

interface ExtraData {
  dashboard?: Dashboard;
  dashboards?: Record<Dashboard["id"], Dashboard>;
}

export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug = {}, userAttributes } = {},
  dimensions = [],
  data = [],
}: {
  extraData?: {
    dashboard?: Dashboard;
    parameterValuesBySlug?: Record<string, ParameterValueOrArray>;
    userAttributes?: Record<UserAttribute, UserAttribute> | null;
  };
  dimensions?: DimensionType[];
  data?: (ClickObjectDataRow & {
    clickBehaviorValue?: ClickObjectDataRow["value"];
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

  const parameterByName = Object.fromEntries(
    dashboardParameters.map(({ name, slug }) => [
      name.toLowerCase(),
      { value: parameterValuesBySlug[slug] },
    ]),
  );

  const parameterBySlug = _.mapObject(parameterValuesBySlug, value => ({
    value,
  }));

  const parameter = Object.fromEntries(
    dashboardParameters.map(({ id, slug }) => [
      id,
      { value: parameterValuesBySlug[slug] },
    ]),
  );

  const userAttribute = Object.fromEntries(
    Object.entries(userAttributes || {}).map(([key, value]) => [
      key,
      { value },
    ]),
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
    let id, target: ClickBehaviorTarget;
    if (o instanceof TemplateTagVariable || o instanceof TemplateTagDimension) {
      let name;
      ({ id, name } = o.tag());
      target = { type: "variable", id: name };
    } else if ("mbql" in o) {
      const dimension: ClickBehaviorDimensionTarget["dimension"] = [
        "dimension",
        o.mbql(),
      ];
      id = JSON.stringify(dimension);
      target = { type: "dimension", id, dimension };
    } else {
      throw new Error("Unknown target type");
    }
    let parentType: string | undefined | null;
    let parameterSourceFilter: SourceFilters["parameter"] = () => true;
    if (o instanceof TemplateTagVariable) {
      const type = o.tag()?.type;
      parentType = type
        ? {
            card: undefined,
            dimension: undefined,
            snippet: undefined,
            text: Text,
            number: Number,
            date: Temporal,
          }[type]
        : undefined;
      parameterSourceFilter = parameter =>
        variableFilterForParameter(parameter)(o);
    } else {
      const field = o.field();

      if (field != null) {
        const { base_type } = field;
        parentType =
          [Temporal, Number, Text].find(
            t => typeof base_type === "string" && isa(base_type, t),
          ) || base_type;
        parameterSourceFilter = parameter =>
          dimensionFilterForParameter(parameter)(o);
      }
    }

    return {
      id,
      target,
      name: o.displayName({ includeTable: true }),
      sourceFilters: {
        column: column =>
          Boolean(
            column.base_type && parentType && isa(column.base_type, parentType),
          ),
        parameter: parameterSourceFilter,
        userAttribute: () => parentType === Text,
      },
    };
  });
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
  return (baseType: string | undefined) => {
    if (typeof baseType === "undefined") {
      return false;
    }
    return allowedTypes.some(allowedType => isa(baseType, allowedType));
  };
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

    if (linkType === "url") {
      return (clickBehavior.linkTemplate || "").length > 0;
    }

    if (linkType === "dashboard" || linkType === "question") {
      return clickBehavior.targetId != null;
    }
  }

  // we've picked "link" without picking a link type
  return false;
}

export function canSaveClickBehavior(
  clickBehavior: ClickBehavior | undefined | null,
  targetDashboard: Dashboard | undefined,
): boolean {
  if (
    clickBehavior?.type === "link" &&
    clickBehavior.linkType === "dashboard"
  ) {
    const tabs = targetDashboard?.tabs || [];
    const dashboardTabExists = tabs.some(tab => tab.id === clickBehavior.tabId);

    if (tabs.length > 1 && !dashboardTabExists) {
      // If the target dashboard tab has been deleted, and there are other tabs
      // to choose from (we don't render <Select/> when there is only 1 tab)
      // make user manually pick a new dashboard tab.
      return false;
    }
  }

  return clickBehaviorIsValid(clickBehavior);
}

export function formatSourceForTarget(
  source: ClickBehaviorSource,
  target: ClickBehaviorTarget,
  {
    data,
    extraData,
    clickBehavior,
  }: {
    data: ValueAndColumnForColumnNameDate;
    extraData: ExtraData;
    clickBehavior: ClickBehavior;
  },
) {
  const datum = data[source.type][source.id.toLowerCase()] || {};
  if (
    "column" in datum &&
    datum.column &&
    isDate(datum.column) &&
    typeof datum.value === "string"
  ) {
    const sourceDateUnit = datum.column.unit || null;

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

      if (
        typeof sourceDateUnit === "string" &&
        ["week", "month", "quarter", "year"].includes(sourceDateUnit)
      ) {
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
  parameterType: string,
  unit: DatetimeUnit | null,
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

export function getTargetForQueryParams(
  target: ClickBehaviorTarget,
  {
    extraData,
    clickBehavior,
  }: {
    extraData: ExtraData;
    clickBehavior: ClickBehavior;
  },
) {
  if (target.type === "parameter") {
    const parameter = getParameter(target, { extraData, clickBehavior });
    return parameter && parameter.slug;
  }
  return target.id;
}

function getParameter(
  target: ClickBehaviorTarget,
  {
    extraData,
    clickBehavior,
  }: {
    extraData: ExtraData;
    clickBehavior: ClickBehavior;
  },
): Parameter | undefined {
  if (clickBehavior.type === "crossfilter") {
    const parameters = extraData.dashboard?.parameters || [];
    return parameters.find(parameter => parameter.id === target.id);
  }

  if (
    clickBehavior.type === "link" &&
    "linkType" in clickBehavior &&
    (clickBehavior.linkType === "dashboard" ||
      clickBehavior.linkType === "question")
  ) {
    const dashboard =
      extraData.dashboards?.[clickBehavior.targetId as DashboardId];
    const parameters = dashboard?.parameters || [];
    return parameters.find(parameter => parameter.id === target.id);
  }

  return undefined;
}
