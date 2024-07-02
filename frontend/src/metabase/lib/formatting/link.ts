import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import {
  formatValue,
  getUrlProtocol,
  isDefaultLinkProtocol,
} from "metabase/lib/formatting";
import { isDate } from "metabase-lib/v1/types/utils/isa";
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

function isSafeUrl(urlString: string): boolean {
  if (isSameOrSiteUrlOrigin(urlString)) {
    return true;
  }
  const protocol = getUrlProtocol(urlString);
  return protocol != null && isDefaultLinkProtocol(protocol);
}

export function renderLinkURLForClick(
  template: string,
  data: ValueAndColumnForColumnNameDate,
) {
  return renderTemplateForClick(
    template,
    data,
    (
      { value, column }: TemplateForClickFormatFunctionParamsType,
      offset: number,
    ) => {
      const valueForLinkTemplate = formatValueForLinkTemplate(value, column);

      if ([null, NULL_DISPLAY_VALUE].includes(valueForLinkTemplate)) {
        return "";
      }

      // We intentionally want to allow users making column link templates like "{{url_from_another_column}}"
      // where url_from_another_column value can be "http://metabase.com/". In such cases, we do not need to
      // apply encodeURIComponent function.
      // To keep it secure we should allow skipping encodeURIComponent only when the template value is coming from
      // a dataset result which means it has a column. Allowing filter parameters is not secure because it enables
      // composing urls like the following:
      // https://myinstance.metabase.com/dashboard/1?my_parameter=https%3A%2F%2Fphishing.com
      // which would make link with "{{my_parameter}}" template open https://phishing.com.
      // Although, having target="_blank" attribute on the links prevents urls like "javascript:alert(document.cookies)" from being
      // executed in the context of the current page and rel="noopener noreferrer" ensures that the linked page does not
      // have access to the window.opener property, additionally checking for safe protocols will not hurt.
      // Also, this only makes sense when such parameters are at the beginning of the link template.
      const isColumnValue = column != null;
      const isStart = offset === 0;
      const shouldSkipEncoding =
        isColumnValue && isStart && isSafeUrl(valueForLinkTemplate);

      return shouldSkipEncoding
        ? valueForLinkTemplate
        : encodeURIComponent(valueForLinkTemplate);
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
    (_whole: string, columnName: string, offset: number) => {
      const valueAndColumn = getValueAndColumnForColumnName(data, columnName);
      if (valueAndColumn) {
        return formatFunction(valueAndColumn, offset);
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
