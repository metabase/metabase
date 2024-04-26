import { formatValue } from "metabase/lib/formatting";
import { isDate } from "metabase-lib/types/utils/isa";
import type { ParameterValueOrArray } from "metabase-types/api";
import type { DatasetColumn, RowValue } from "metabase-types/api/dataset";

import { NULL_DISPLAY_VALUE } from "../constants";

import { formatDateTimeForParameter } from "./date";

type Value = ParameterValueOrArray | RowValue | undefined;

interface TemplateForClickFormatFunctionParamsType {
  value: Value;
  column: DatasetColumn;
}

export interface ValueAndColumnForColumnNameDate {
  column: Record<string, TemplateForClickFormatFunctionParamsType>;
  parameter: Record<string, { value: Value }>;
  parameterBySlug: Record<string, { value: Value }>;
  parameterByName: Record<string, { value: Value }>;
  userAttribute: Record<string, { value: Value }>;
}

function formatValueForLinkTemplate(value: Value, column: DatasetColumn) {
  if (isDate(column) && column.unit && typeof value === "string") {
    return formatDateTimeForParameter(value, column.unit);
  }
  return value;
}

export function renderLinkTextForClick(
  template: string,
  data: ValueAndColumnForColumnNameDate,
) {
  return renderTemplateForClick(
    template,
    data,
    ({ value, column }: TemplateForClickFormatFunctionParamsType) =>
      formatValue(value, { column }),
  );
}

export function renderLinkURLForClick(
  template: string,
  data: ValueAndColumnForColumnNameDate,
) {
  return renderTemplateForClick(
    template,
    data,
    ({ value, column }: TemplateForClickFormatFunctionParamsType) => {
      const valueForLinkTemplate = formatValueForLinkTemplate(value, column);

      if ([null, NULL_DISPLAY_VALUE].includes(valueForLinkTemplate)) {
        return "";
      }

      return encodeURIComponent(valueForLinkTemplate);
    },
  );
}

function renderTemplateForClick(
  template: string,
  data: ValueAndColumnForColumnNameDate,
  formatFunction: any = ({ value }: TemplateForClickFormatFunctionParamsType) =>
    value,
) {
  return template.replace(
    /{{([^}]+)}}/g,
    (whole: string, columnName: string) => {
      const valueAndColumn = getValueAndColumnForColumnName(data, columnName);
      if (valueAndColumn) {
        return formatFunction(valueAndColumn);
      }
      return "";
    },
  );
}

function getValueAndColumnForColumnName(
  {
    column,
    parameterBySlug,
    parameterByName,
    userAttribute,
  }: ValueAndColumnForColumnNameDate,
  columnName: string,
) {
  const name = columnName.toLowerCase();
  const dataSources: [string, Record<string, { value: Value }>][] = [
    ["column", column],
    ["filter", parameterByName],
    ["filter", parameterBySlug], // doubling up "filter" lets us search params both by name and slug
    ["user", userAttribute],
  ];

  for (const [key, data] of dataSources) {
    const prefix = key + ":";
    if (name.startsWith(prefix)) {
      return data[name.slice(prefix.length)];
    }
  }
  for (const [, data] of dataSources) {
    if (data[name]) {
      return data[name];
    }
  }
  return "";
}
