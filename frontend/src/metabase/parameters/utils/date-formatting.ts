import { t } from "ttag";

import { formatDateFilter } from "metabase/querying/filters/utils/dates";
import { deserializeDateFilter } from "metabase/querying/parameters/utils/dates";
import {
  DATE_OPERATORS,
  generateTimeFilterValuesDescriptions,
} from "metabase-lib/v1/queries/utils/query-time";

function getFilterOperator(filter: any[] = []) {
  return DATE_OPERATORS.find(op => op.test(filter as any));
}

const prefixedOperators = new Set([
  "exclude",
  "before",
  "after",
  "on",
  "empty",
  "not-empty",
]);

export function getFilterTitle(filter: any[]) {
  const values = generateTimeFilterValuesDescriptions(filter);
  const desc =
    values.length > 2
      ? t`${values.length} selections`
      : values.join(filter[0] === "!=" ? ", " : " - ");
  const op = getFilterOperator(filter);
  const prefix =
    op && prefixedOperators.has(op.name)
      ? `${op.displayPrefix ?? op.displayName} `
      : "";
  return prefix + desc;
}

export function formatDateValue(value: string): string | null {
  const filterValue = deserializeDateFilter(value);
  if (filterValue == null) {
    return null;
  }

  return formatDateFilter(filterValue);
}
