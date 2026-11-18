import { getEventTableSettings } from "metabase/event-tables";
import * as Lib from "metabase-lib";
import type { FieldId, Table } from "metabase-types/api";

const STAGE_INDEX = -1;

/** The field playing the table's event name role; undefined without one. */
export const getEventNameFieldId = (
  table: Table | undefined,
): FieldId | undefined => {
  const columnName = getEventTableSettings(table)["columns.event_name"];
  return columnName !== null
    ? table?.fields?.find((field) => field.name === columnName)?.id
    : undefined;
};

/**
 * The event name a query picks when its only condition is "event name is X",
 * e.g. "signup"; null for any other conditions.
 */
export const getEventNameValue = (
  query: Lib.Query,
  eventNameFieldId: FieldId | undefined,
): string | null => {
  const filters = Lib.filters(query, STAGE_INDEX);
  if (eventNameFieldId === undefined || filters.length !== 1) {
    return null;
  }
  // Not stringFilterParts: it can't read a saved definition whose field ref
  // has no base type.
  const { operator, args } = Lib.expressionParts(
    query,
    STAGE_INDEX,
    filters[0],
  );
  const [column, value] = args;
  const isOneEventName =
    operator === "=" &&
    args.length === 2 &&
    Lib.isColumnMetadata(column) &&
    Lib.fieldSearchInfo(query, column).fieldId === eventNameFieldId &&
    typeof value === "string";
  return isOneEventName ? value : null;
};

/** The table query's event name column; undefined when it has none. */
export const findEventNameColumn = (
  tableQuery: Lib.Query,
  eventNameFieldId: FieldId,
): Lib.ColumnMetadata | undefined =>
  Lib.filterableColumns(tableQuery, STAGE_INDEX).find(
    (column) =>
      Lib.fieldSearchInfo(tableQuery, column).fieldId === eventNameFieldId,
  );

/** The table query with one condition: the event name `column` is `value`. */
export const withEventNameCondition = (
  tableQuery: Lib.Query,
  column: Lib.ColumnMetadata,
  value: string,
): Lib.Query =>
  Lib.filter(
    tableQuery,
    STAGE_INDEX,
    Lib.stringFilterClause({
      operator: "=",
      column,
      values: [value],
      options: {},
    }),
  );

const SEPARATORS = /[_.-]+/g;

/**
 * An event name as a label, e.g. "subscription_cancelled" as "Subscription
 * cancelled". A name with capitals, like "Order Completed" or "signUp", was
 * written for people already and stays as it is.
 */
export const formatEventName = (value: string): string => {
  const spaced = value.replace(SEPARATORS, " ").trim();
  if (value !== value.toLowerCase() || spaced === "") {
    return value;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Text for matching a search against an event name, either way it's written. */
export const toSearchText = (text: string): string =>
  text.toLowerCase().replace(SEPARATORS, " ").trim();
