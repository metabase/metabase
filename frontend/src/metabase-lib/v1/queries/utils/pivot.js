import _ from "underscore";

import * as Lib from "metabase-lib";

export function getPivotColumnSplit(question) {
  const setting = question.setting("pivot_table.column_split");
  const query = question.query();
  const stageIndex = -1;
  const breakoutColumns = Lib.breakouts(query, stageIndex)
    .map(breakout => Lib.breakoutColumn(query, stageIndex, breakout))
    .filter(Boolean);

  const { rows: pivot_rows, columns: pivot_cols } = _.mapObject(
    setting,
    fieldRefs => {
      if (breakoutColumns.length === 0) {
        return [];
      }

      const nonEmptyFieldRefs = fieldRefs.filter(fieldRef => fieldRef != null);
      const breakoutIndexes = Lib.findColumnIndexesFromLegacyRefs(
        query,
        stageIndex,
        breakoutColumns,
        nonEmptyFieldRefs,
      );
      return nonEmptyFieldRefs
        .map((_, fieldIndex) => breakoutIndexes[fieldIndex])
        .filter(breakoutIndex => breakoutIndex >= 0);
    },
  );

  return { pivot_rows, pivot_cols };
}
