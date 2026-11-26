import { useState } from "react";
import _ from "underscore";

import * as Lib from "metabase-lib";

/**
 * Returns the same value for as long as `isEqual` says it's unchanged, deep
 * equality by default.
 */
export function useStableValue<T>(
  value: T,
  isEqual: (a: T, b: T) => boolean = _.isEqual,
): T {
  const [stableValue, setStableValue] = useState(value);
  if (!isEqual(stableValue, value)) {
    setStableValue(value);
    return value;
  }
  return stableValue;
}

const areQueriesEqual = (a: Lib.Query | undefined, b: Lib.Query | undefined) =>
  a === undefined || b === undefined
    ? a === b
    : Lib.areQueriesEqual(Lib.toJsQuery(a), Lib.toJsQuery(b));

/**
 * Returns the same query for as long as it's unchanged. Building a query again
 * gives its clauses new uuids, and so a new identity and a new request key.
 */
export function useStableQuery(
  query: Lib.Query | undefined,
): Lib.Query | undefined {
  return useStableValue(query, areQueriesEqual);
}
