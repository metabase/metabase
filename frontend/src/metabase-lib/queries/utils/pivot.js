import _ from "underscore";
import * as Lib from "metabase-lib";

export function getPivotColumnSplit(question) {
  const setting = question.setting("pivot_table.column_split");
  const query = question.query();
  const stageIndex = -1;
  const breakoutColumns = Lib.breakouts(query, stageIndex).map(breakout =>
    Lib.breakoutColumn(query, stageIndex, breakout),
  );

  const { rows: pivot_rows, columns: pivot_cols } = _.mapObject(
    setting,
    fieldRefs => {
      const breakoutIndexes = Lib.findColumnIndexesFromLegacyRefs(
        query,
        stageIndex,
        breakoutColumns,
        fieldRefs,
      );
      return fieldRefs.filter(fieldIndex => breakoutIndexes[fieldIndex] >= 0);
    },
  );

  return { pivot_rows, pivot_cols };
}
