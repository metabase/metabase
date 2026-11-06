import { parseParameterValue } from "metabase/parameters/utils/parameter-parsing";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type { ValueAndColumnForColumnNameDate } from "metabase/value-formatting";
import {
  formatDateTimeForParameter,
  formatDateToRangeForParameter,
} from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  columnFilterForParameter,
  dimensionTagFilterForParameter,
  variableTagFilterForParameter,
} from "metabase-lib/v1/parameters/utils/filters";
import { getParameterColumns } from "metabase-lib/v1/parameters/utils/targets";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  isDate,
  isDateWithoutTime,
  isa,
} from "metabase-lib/v1/types/utils/isa";
import type {
  ClickBehavior,
  ClickBehaviorDimensionTarget,
  ClickBehaviorSource,
  ClickBehaviorTarget,
  Dashboard,
  DashboardId,
  DatasetColumn,
  DatetimeUnit,
  Parameter,
  QuestionDashboardCard,
  TemplateTag,
} from "metabase-types/api";
import { clickBehaviorIsValid } from "metabase-types/guards";

export interface Target {
  id: Parameter["id"];
  name: Parameter["name"] | null | undefined;
  target: ClickBehaviorTarget;
  sourceFilters: SourceFilters;
}

export interface SourceFilters {
  column: (column: DatasetColumn) => boolean;
  parameter: (parameter: Parameter) => boolean;
  userAttribute: (userAttribute: string) => boolean;
}

export interface ClickBehaviorExtraData {
  dashboard?: Dashboard;
  parameters?: Parameter[];
  dashboards?: Record<Dashboard["id"], Dashboard>;
}

function notRelativeDateOrRange({ type }: Parameter) {
  return type !== "date/range" && type !== "date/relative";
}

export function getTargetsForQuestion(question: Question): Target[] {
  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (isNative) {
    return getTargetsForNativeQuestion(question);
  }

  return getTargetsForStructuredQuestion(question);
}

function getTargetsForStructuredQuestion(question: Question): Target[] {
  const { query, columns } = getParameterColumns(question);

  return columns.map(({ column: targetColumn, stageIndex }) => {
    const dimension: ClickBehaviorDimensionTarget["dimension"] = [
      "dimension",
      Lib.legacyRef(query, stageIndex, targetColumn),
      { "stage-number": stageIndex },
    ];
    const id = JSON.stringify(dimension);
    const target: ClickBehaviorTarget = { type: "dimension", id, dimension };

    return {
      id,
      target,
      name: Lib.displayInfo(query, stageIndex, targetColumn).longDisplayName,
      sourceFilters: {
        column: (sourceColumn) =>
          Lib.isAssignableType(
            Lib.legacyColumnTypeInfo(sourceColumn),
            targetColumn,
          ),
        parameter: (parameter) =>
          columnFilterForParameter(query, stageIndex, parameter)(targetColumn),
        userAttribute: () =>
          Lib.isStringOrStringLike(targetColumn) ||
          Lib.isNumeric(targetColumn) ||
          Lib.isBoolean(targetColumn) ||
          Lib.isDateOrDateTime(targetColumn),
      },
    };
  });
}

function getTargetsForNativeQuestion(question: Question): Target[] {
  const query = question.query();
  const tags = Object.values(Lib.templateTags(query));

  return [
    ...tags
      .filter((tag) => tag.type === "dimension")
      .map((tag) => getTargetForDimensionTag(query, tag)),
    ...tags
      .filter((tag) => tag.type !== "dimension")
      .map(getTargetForVariableTag),
  ];
}

function getColumnParentType(column: Lib.ColumnMetadata) {
  if (Lib.isTemporal(column)) {
    return TYPE.Temporal;
  }
  if (Lib.isNumeric(column)) {
    return TYPE.Number;
  }
  if (Lib.isStringOrStringLike(column)) {
    return TYPE.Text;
  }
  if (Lib.isBoolean(column)) {
    return TYPE.Boolean;
  }
  return undefined;
}

function getTargetForDimensionTag(query: Lib.Query, tag: TemplateTag): Target {
  const fieldId = tag["field-id"];
  const column = fieldId != null ? Lib.fieldMetadata(query, fieldId) : null;
  const parentType = column != null ? getColumnParentType(column) : undefined;

  return {
    id: tag.id,
    target: { type: "variable", id: tag.name },
    name:
      tag["display-name"] ??
      (column != null ? Lib.displayInfo(query, -1, column).displayName : ""),
    sourceFilters: {
      column: (column: DatasetColumn) =>
        Boolean(
          column.effective_type &&
          parentType &&
          isa(column.effective_type, parentType),
        ),
      parameter: (parameter) =>
        dimensionTagFilterForParameter(query, parameter)(tag),
      userAttribute: () => parentType === TYPE.Text,
    },
  };
}

function getTargetForVariableTag(tag: TemplateTag): Target {
  const parentType = {
    card: undefined,
    dimension: undefined,
    snippet: undefined,
    "temporal-unit": undefined,
    table: undefined,
    text: TYPE.Text,
    number: TYPE.Number,
    date: TYPE.Temporal,
    boolean: TYPE.Boolean,
  }[tag.type];

  return {
    id: tag.id,
    target: { type: "variable", id: tag.name },
    name: tag["display-name"] || tag.name,
    sourceFilters: {
      column: (column: DatasetColumn) =>
        Boolean(
          column.effective_type &&
          parentType &&
          isa(column.effective_type, parentType),
        ),
      parameter: (parameter) => variableTagFilterForParameter(parameter)(tag),
      userAttribute: () => parentType === TYPE.Text,
    },
  };
}

export function getTargetsForDashboard(
  dashboard: Dashboard,
  dashcard: QuestionDashboardCard,
): Target[] {
  if (!dashboard.parameters) {
    return [];
  }

  return dashboard.parameters.map((parameter) => {
    const { type, id, name } = parameter;
    const filter = baseTypeFilterForParameterType(type);
    return {
      id,
      name,
      target: { type: "parameter", id },
      sourceFilters: {
        column: (c: DatasetColumn) =>
          notRelativeDateOrRange(parameter) && filter(c.effective_type),
        parameter: (sourceParam) => {
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
    "temporal-unit": [TYPE.Text, TYPE.TextLike],
    boolean: [TYPE.Boolean],
  }[typePrefix];
  if (allowedTypes === undefined) {
    // default to showing everything
    return () => true;
  }
  return (baseType: string | undefined) => {
    if (typeof baseType === "undefined") {
      return false;
    }
    return allowedTypes.some((allowedType) => isa(baseType, allowedType));
  };
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
    const dashboardTabExists = tabs.some(
      (tab) => tab.id === clickBehavior.tabId,
    );

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
    extraData: ClickBehaviorExtraData;
    clickBehavior: ClickBehavior;
  },
) {
  const datum = data[source.type][source.id.toLowerCase()] || {};
  const parameter = getParameter(target, { extraData, clickBehavior });

  if (parameter?.type === "temporal-unit") {
    return parseParameterValue(datum.value, parameter);
  }

  if (
    "column" in datum &&
    datum.column &&
    isDate(datum.column) &&
    typeof datum.value === "string"
  ) {
    const sourceDateUnit = datum.column.unit || null;
    const fallbackUnit = isDateWithoutTime(datum.column) ? "day" : "minute";

    if (target.type === "parameter") {
      // we should serialize differently based on the target parameter type
      if (parameter) {
        return formatDateForParameterType(
          datum.value,
          parameter.type,
          sourceDateUnit ?? fallbackUnit,
        );
      }
    } else {
      if (
        typeof sourceDateUnit === "string" &&
        ["week", "month", "quarter", "year", "hour", "minute"].includes(
          sourceDateUnit,
        )
      ) {
        return formatDateToRangeForParameter(datum.value, sourceDateUnit);
      }

      return formatDateForParameterType(
        datum.value,
        "date/single",
        sourceDateUnit ?? fallbackUnit,
      );
    }
  }

  if (parameter?.type === "number/between" && "column" in datum) {
    const value = datum.value;
    const binWidth = datum.column?.binning_info?.bin_width;

    if (binWidth != null && typeof value === "number") {
      return [value, value + binWidth];
    }
  }

  return parameter ? parseParameterValue(datum.value, parameter) : datum.value;
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
    if (unit === "hour" || unit === "minute") {
      return m.format("YYYY-MM-DDTHH:mm");
    }
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
    extraData: ClickBehaviorExtraData;
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
    extraData: ClickBehaviorExtraData;
    clickBehavior: ClickBehavior;
  },
): Parameter | undefined {
  if (clickBehavior.type === "crossfilter") {
    const parameters = extraData.parameters ?? [];
    return parameters.find((parameter) => parameter.id === target.id);
  }

  if (
    clickBehavior.type === "link" &&
    "linkType" in clickBehavior &&
    (clickBehavior.linkType === "dashboard" ||
      clickBehavior.linkType === "question")
  ) {
    // Unjustified type cast. FIXME
    const dashboardId = clickBehavior.targetId as DashboardId;
    const parameters =
      extraData.dashboard?.id === dashboardId
        ? (extraData.parameters ?? [])
        : (extraData.dashboards?.[dashboardId]?.parameters ?? []);
    return parameters.find((parameter) => parameter.id === target.id);
  }

  return undefined;
}
