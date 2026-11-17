import * as Lib from "metabase-lib";

/**
 * The table that the first stage of the query reads, or `undefined` for other
 * sources, like a saved question.
 */
export function getPrimarySourceTableId(query: Lib.Query): number | undefined {
  const tableId = Lib.primarySourceTableId(query);
  return typeof tableId === "number" ? tableId : undefined;
}
