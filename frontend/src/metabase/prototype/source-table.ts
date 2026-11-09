import * as Lib from "metabase-lib";
import type { ConcreteTableId } from "metabase-types/api";

/**
 * The table that the first stage of the query reads, or `undefined` for other
 * sources, like a saved question. Master renamed `Lib.sourceTableOrCardId`, and
 * the PR env builds this branch merged into master, so this function uses only
 * an API that both have.
 */
export function getPrimarySourceTableId(
  query: Lib.Query,
): ConcreteTableId | undefined {
  const legacyQuery = Lib.toLegacyQuery(query);
  if (legacyQuery.type !== "query") {
    return undefined;
  }
  const sourceTable = legacyQuery.query["source-table"];
  return typeof sourceTable === "number" ? sourceTable : undefined;
}
