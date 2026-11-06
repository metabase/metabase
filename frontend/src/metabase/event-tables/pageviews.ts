import { isNumericBaseType } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { isColumnIn } from "./column-roles";

/** Events are pageviews where `column` is `value`, e.g. `event_name = 'page_view'`. */
export type ColumnValuePageviewRule = {
  type: "column_value";
  column: string;
  value: string | number;
};

/**
 * Which events are pageviews, which paths name by their URL path. Stored by
 * column name, like the column roles. Null when no event is.
 */
export type PageviewRule = { type: "every_event" } | ColumnValuePageviewRule;

export const EVERY_EVENT: PageviewRule = { type: "every_event" };

/** Numeric columns hold numbers, and every other column text. */
const isPageviewValueFor = (field: Field, value: string | number): boolean =>
  isNumericBaseType(field) === (typeof value === "number");

const isRuleValue = (value: unknown): value is string | number =>
  typeof value === "string" || Number.isFinite(value);

export const isPageviewRule = (
  value: unknown,
  table: Table | undefined,
): value is PageviewRule => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  if (value.type === "every_event") {
    return true;
  }
  if (
    value.type !== "column_value" ||
    !("column" in value) ||
    !("value" in value)
  ) {
    return false;
  }
  const { column, value: ruleValue } = value;
  return (
    typeof column === "string" &&
    isRuleValue(ruleValue) &&
    isColumnIn(table?.fields, column, (field) =>
      isPageviewValueFor(field, ruleValue),
    )
  );
};
