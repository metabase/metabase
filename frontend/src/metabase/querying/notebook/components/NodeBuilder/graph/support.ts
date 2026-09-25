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
  // MLv2 cannot hold an empty field list, so the canvas would put every column back.
  const columns = Lib.fieldableColumns(trimmed, 0);
  if (
    columns.length > 0 &&
    columns.every((column) => !Lib.displayInfo(trimmed, 0, column).selected)
  ) {
    return t`a column selection that leaves out every source column`;
  }
  for (const stageIndex of Lib.stageIndexes(trimmed)) {
    if (stageIndex === 0) {
      continue;
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
