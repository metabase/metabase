import { formatValue } from "metabase/lib/formatting";
import type { DatasetColumn } from "metabase-types/api/dataset";
import { isDate } from "metabase-lib/types/utils/isa";
import { formatDateTimeForParameter } from "./date";

interface TemplateForClickFormatFunctionParamsType {
  value: string;
  column: DatasetColumn;
}

export interface ValueAndColumnForColumnNameDate {
  column: DatasetColumn;
  parameterBySlug: string;
  parameterByName: string;
  userAttribute: string;
}

function formatValueForLinkTemplate(value: string, column: DatasetColumn) {
  if (isDate(column) && column.unit) {
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
  const dataSources: any[] = [
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
