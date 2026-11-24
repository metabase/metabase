import { c } from "ttag";

import * as Lib from "metabase-lib";
import type { JsFilterClause } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

const STAGE_INDEX = -1;

/**
 * An event: rows of the event table that match all of its conditions. When
 * name is `null`, it's auto-generated from the conditions.
 */
export type EventDefinition = {
  name: string | null;
  conditions: Lib.FilterClause[];
};

/** An event definition as JSON, the way a setting stores it. */
export type JsEventDefinition = {
  name: string | null;
  conditions: JsFilterClause[];
};

const isName = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value.trim() !== "");

export const readEventDefinition = (value: unknown): EventDefinition | null => {
  if (
    !isObject(value) ||
    !isName(value.name) ||
    !Array.isArray(value.conditions) ||
    value.conditions.length === 0
  ) {
    return null;
  }
  const conditions = value.conditions.map((condition: unknown) =>
    Lib.fromJsFilterClause(condition),
  );
  return conditions.every((condition) => condition !== null)
    ? { name: value.name, conditions }
    : null;
};

export const isJsEventDefinition = (
  value: unknown,
): value is JsEventDefinition => readEventDefinition(value) !== null;

export const toJsEventDefinition = ({
  name,
  conditions,
}: EventDefinition): JsEventDefinition => ({
  name,
  conditions: conditions.map(Lib.toJsFilterClause),
});

/** The table's query, filtered by the event's conditions. */
export const getEventQuery = (
  tableQuery: Lib.Query,
  { conditions }: Pick<EventDefinition, "conditions">,
): Lib.Query =>
  conditions.reduce(
    (query, condition) => Lib.filter(query, STAGE_INDEX, condition),
    tableQuery,
  );

/** The event whose conditions are the query's filters. */
export const getQueryEventDefinition = (
  query: Lib.Query,
  name: string | null,
): EventDefinition => ({
  name,
  conditions: Lib.filters(query, STAGE_INDEX),
});

/** The query's filters' names joined with "and", or "" without filters. */
export const getConditionsName = (query: Lib.Query): string => {
  const [first, ...rest] = Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
  return rest.reduce(
    (names, name) =>
      c("{0} is a list of conditions, {1} is one more condition")
        .t`${names} and ${name}`,
    first ?? "",
  );
};
