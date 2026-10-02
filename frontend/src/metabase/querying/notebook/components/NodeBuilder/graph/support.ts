// Which queries the canvas can hold in full.

import { t } from "ttag";

import * as Lib from "metabase-lib";

// What keeps a query off the canvas, as a phrase for "it has …". Null means
// the graph can hold all of it without losing anything. The list shrinks as
// the builder learns more of the notebook.
export function getUnsupportedReason(query: Lib.Query): string | null {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    return t`a native query`;
  }
  const trimmed = Lib.dropEmptyStages(query);
  if (!keepsSourceFields(trimmed)) {
    return t`a column selection the canvas can't keep`;
  }
  for (const stageIndex of Lib.stageIndexes(trimmed)) {
    if (stageIndex === 0) {
      continue;
    }
    // A table block only picks columns on the first stage.
    if (Lib.fields(trimmed, stageIndex).length > 0) {
      return t`a column selection on a later stage`;
    }
    const followsSummarize =
      Lib.aggregations(trimmed, stageIndex - 1).length > 0 ||
      Lib.breakouts(trimmed, stageIndex - 1).length > 0;
    if (!followsSummarize) {
      return t`a nested query without a summarize`;
    }
  }
  return null;
}

// A table block remembers which columns are left out, nothing more, and the
// compiler rebuilds the field list from that in the table's own order. Any
// field list that comes back different would overwrite the question on open.
function keepsSourceFields(query: Lib.Query): boolean {
  if (Lib.fields(query, 0).length === 0) {
    return true;
  }
  const columns = Lib.fieldableColumns(query, 0);
  const kept = columns.filter(
    (column) => Lib.displayInfo(query, 0, column).selected,
  );
  const rebuilt =
    kept.length > 0 && kept.length < columns.length
      ? Lib.withFields(query, 0, kept)
      : Lib.withFields(query, 0, []);
  return (
    JSON.stringify(Lib.toLegacyQuery(rebuilt)) ===
    JSON.stringify(Lib.toLegacyQuery(query))
  );
}
