import {
  formatDateTimeForParameter,
  formatDateToRangeForParameter,
} from "metabase/lib/formatting/date";
import type { ValueAndColumnForColumnNameDate } from "metabase/lib/formatting/link";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { checkNotNull } from "metabase/lib/types";
import { TYPE } from "metabase/lib/types/constants";
import { isDate, isa } from "metabase/lib/types/isa";
import * as Lib from "metabase-lib";
import type { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import type Question from "metabase-lib/v1/Question";
import {
  columnFilterForParameter,
  dimensionFilterForParameter,
  variableFilterForParameter,
} from "metabase-lib/v1/parameters/utils/filters";
import { getParameterColumns } from "metabase-lib/v1/parameters/utils/targets";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
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
} from "metabase-types/api";

import { parseParameterValue } from "./parameter-parsing";

interface Target {
  id: Parameter["id"];
  name: Parameter["name"] | null | undefined;
  target: ClickBehaviorTarget;
  sourceFilters: SourceFilters;
}

interface SourceFilters {
  column: (column: DatasetColumn, question: Question) => boolean;
  parameter: (parameter: Parameter) => boolean;
  userAttribute: (userAttribute: string) => boolean;
}

interface ExtraData {
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
  const legacyNativeQuery = question.legacyNativeQuery() as NativeQuery;

  return [
    ...getTargetsForDimensionOptions(legacyNativeQuery),
    ...getTargetsForVariables(legacyNativeQuery),
  ];
}

function getTargetsForDimensionOptions(
  legacyNativeQuery: NativeQuery,
): Target[] {
  return legacyNativeQuery
    .dimensionOptions()
    .all()
    .map((templateTagDimension) => {
      const { name, id } = (
        templateTagDimension as unknown as TemplateTagDimension
      ).tag();
      const target: ClickBehaviorTarget = { type: "variable", id: name };

      const field = templateTagDimension.field();
      const effectiveType = field?.effective_type;

      const parentType =
        [TYPE.Temporal, TYPE.Number, TYPE.Text, TYPE.Boolean].find(
          (t) => typeof effectiveType === "string" && isa(effectiveType, t),
        ) || effectiveType;

      return {
        id,
        target,
        name: templateTagDimension.displayName(),
        sourceFilters: {
          column: (column: DatasetColumn) =>
            Boolean(
              column.effective_type &&
                parentType &&
                isa(column.effective_type, parentType),
            ),
          parameter: (parameter) =>
            dimensionFilterForParameter(parameter)(templateTagDimension),
          userAttribute: () => parentType === TYPE.Text,
        },
      };
    });
}

function getTargetsForVariables(legacyNativeQuery: NativeQuery): Target[] {
  return legacyNativeQuery.variables().map((templateTagVariable) => {
    const { name, id, type } = checkNotNull(templateTagVariable.tag());
    const target: ClickBehaviorTarget = { type: "variable", id: name };
    const parentType = type
      ? {
          card: undefined,
          dimension: undefined,
          snippet: undefined,
          "temporal-unit": undefined,
          table: undefined,
          text: TYPE.Text,
          number: TYPE.Number,
          date: TYPE.Temporal,
          boolean: TYPE.Boolean,
        }[type]
      : undefined;

    return {
      id,
      target,
      name: templateTagVariable.displayName(),
      sourceFilters: {
        column: (column: DatasetColumn) =>
          Boolean(
            column.effective_type &&
              parentType &&
              isa(column.effective_type, parentType),
          ),
        parameter: (parameter) =>
          variableFilterForParameter(parameter)(templateTagVariable),
        userAttribute: () => parentType === TYPE.Text,
      },
    };
  });
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

    if (target.type === "parameter") {
      // we should serialize differently based on the target parameter type
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
        ["week", "month", "quarter", "year", "hour", "minute"].includes(
          sourceDateUnit,
        )
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
    const parameters = extraData.parameters ?? [];
    return parameters.find((parameter) => parameter.id === target.id);
  }

  if (
    clickBehavior.type === "link" &&
    "linkType" in clickBehavior &&
    (clickBehavior.linkType === "dashboard" ||
      clickBehavior.linkType === "question")
  ) {
    const dashboardId = clickBehavior.targetId as DashboardId;
    const parameters =
      extraData.dashboard?.id === dashboardId
        ? (extraData.parameters ?? [])
        : (extraData.dashboards?.[dashboardId]?.parameters ?? []);
    return parameters.find((parameter) => parameter.id === target.id);
  }

  return undefined;
}
