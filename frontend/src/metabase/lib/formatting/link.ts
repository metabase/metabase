import { isDate } from "metabase/lib/schema_metadata";

import { formatValue } from "metabase/lib/formatting";
import { formatDateTimeForParameter } from "./date";

import type { DatasetColumn } from "metabase-types/api/dataset";

interface ValueAndColumnForColumnNameDate {
  column: DatasetColumn;
  parameterBySlug: string;
  parameterByName: string;
  userAttribute: string;
}

function formatValueForLinkTemplate(value: number, column: DatasetColumn) {
  if (isDate(column) && column.unit) {
    return formatDateTimeForParameter(value, column.unit);
  }
  return value;
}

export function renderLinkTextForClick(template: string, data) {
  return renderTemplateForClick(template, data, ({ value, column }) =>
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
    ({ value: string, column: DatasetColumn }) =>
      encodeURIComponent(formatValueForLinkTemplate(value, column)),
  );
}

function renderTemplateForClick(
  template: string,
  data: ValueAndColumnForColumnNameDate,
  formatFunction: (any) => any = ({ value }) => value,
) {
  return template.replace(
    /{{([^}]+)}}/g,
    (whole: string, columnName: string) => {
      const valueAndColumn = getValueAndColumnForColumnName(data, columnName);
      if (valueAndColumn) {
        return formatFunction(valueAndColumn);
      }
      console.warn("Missing value for " + name);
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
