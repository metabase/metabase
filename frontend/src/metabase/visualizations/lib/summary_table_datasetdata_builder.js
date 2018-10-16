import type {
  ColumnHeader,
  QueryPlan,
  ResultProvider,
  SummaryTableDatasetData,
  SummaryTableSettings
} from "metabase/meta/types/summary_table";
import type {ColumnName, DatasetData, Column} from "metabase/meta/types/Dataset";
import set from "lodash.set";
import flatMap from "lodash.flatmap";
import zip from "lodash.zip";

const repeat = (values: [], len) => flatMap(Array(len), () => values);

const getColumnsFromPivotSource = ({columns, rows}:DatasetData, columnName : ColumnName) => {
  const pivotIndex = columns.indexOf(columnName);
  const resSet = rows.reduce((acc, elem) => acc.add(elem[pivotIndex]), new Set());
  return Array.from(resSet);
};

const buildColumnHeaders = ({groupsSources, columnsSource, valuesSources}: SummaryTableSettings, mainResults: DatasetData) :
  {columnsHeaders: ColumnHeader[][], cols:Column[] } => {

  const columnNameToColumn = mainResults.cols.reduce((acc, column) => set(acc, column.name, column), {});
  const getColumn = columnName => columnNameToColumn[columnName];
  const toColumnHeader = column=> ({ column, columnSpan: 1});

  const partGroupingsRaw = groupsSources.map(getColumn).map(toColumnHeader);
  const partValuesRaw = valuesSources.map(getColumn).map(toColumnHeader);

  const isPivoted = columnsSource.length > 0;
  if(isPivoted){
    const pivotSource = columnsSource[0];
    const pivotColumn = getColumn(pivotSource);
    const columnSpan = partValuesRaw.length;
    const partPivotRaw = getColumnsFromPivotSource(mainResults, pivotSource).map(value => ({column:pivotColumn, value, columnSpan }));

    const topRow = [...partGroupingsRaw.map(() => null), ...flatMap(partPivotRaw.map(header => set(Array(header.columnSpan), 0, header)))];
    const bottomRow = [...partGroupingsRaw, ...repeat(partValuesRaw, partPivotRaw.length)];

    if(columnSpan === 1){
      return {columnsHeaders :[zip(topRow, bottomRow).map(([top, bottom]) => top || bottom)],
        cols: bottomRow.map(p => p.column)};
    }

    return {columnsHeaders :[topRow, bottomRow], cols: bottomRow.map(p => p.column)};
  }
  else {
    const mainRow = [...partGroupingsRaw, ...partValuesRaw];
    return {columnsHeaders : [mainRow], cols : mainRow.map(p => p.column)};
  }
};

export const buildDatasetData = (settings: SummaryTableSettings, mainResults: DatasetData, resultsProvider: ResultProvider): SummaryTableDatasetData => {
  const {columnsHeaders, cols} = buildColumnHeaders(settings, mainResults);


  return {columnsHeaders, cols, columns: cols.map(p => p.name)}
};
