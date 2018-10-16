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
import orderBy from "lodash.orderby";
import {canTotalizeByType} from "metabase/visualizations/lib/settings/summary_table";
import {grandTotalsLabel} from "metabase/visualizations/lib/summary_table";

const repeat = (values: [], len) => flatMap(Array(len), () => values);

const getColumnsFromPivotSource = ({columns, rows}:DatasetData, columnName : ColumnName) => {
  const pivotIndex = columns.indexOf(columnName);
  const resSet = rows.reduce((acc, elem) => acc.add(elem[pivotIndex]), new Set());
  return Array.from(resSet);
};

const buildColumnHeaders = ({groupsSources, columnsSource, valuesSources, columnNameToMetadata}: SummaryTableSettings, mainResults: DatasetData) :
  {columnsHeaders: ColumnHeader[][], cols:Column[] } => {

  const columnNameToColumn = mainResults.cols.reduce((acc, column) => set(acc, column.name, column), {});
  const getColumn = columnName => columnNameToColumn[columnName];
  const toColumnHeader = column => ({ column, columnSpan: 1});
  const getSortOrder = columnName => columnNameToMetadata[columnName].isAscSortOrder ? 'asc' : 'desc';
  const shouldTotlize = columnName => canTotalizeByType(getColumn(columnName).base_type);
  const showTotalsFor = columnName => columnNameToMetadata[columnName].showTotals;

  const partGroupingsRaw = groupsSources.map(getColumn).map(toColumnHeader);
  const partValuesRaw = valuesSources.map(getColumn).map(toColumnHeader);

  const isPivoted = columnsSource.length > 0;
  if(isPivoted){
    const pivotSource = columnsSource[0];
    const pivotColumn = getColumn(pivotSource);
    const columnSpan = partValuesRaw.length;
    const partPivotRaw = orderBy(getColumnsFromPivotSource(mainResults, pivotSource), p => p, getSortOrder(pivotSource))
                          .map(value => ({column:pivotColumn, value, columnSpan }));

    const partValuesTotalized = partValuesRaw.filter(({column : {name}}) => shouldTotlize(name));
    const grandTotalsSpan = partValuesTotalized.length;

    const hasGrandsTotalsColumn = showTotalsFor(pivotSource) && grandTotalsSpan> 0;


    const topRowNormalPart = [...partGroupingsRaw.map(() => null), ...flatMap(partPivotRaw.map(header => set(Array(header.columnSpan), 0, header)))];
    const topRow = hasGrandsTotalsColumn ?
        [...topRowNormalPart, {column:pivotColumn, columnSpan: grandTotalsSpan, displayText: grandTotalsLabel}, ...repeat([null], grandTotalsSpan-1)]
      : topRowNormalPart;
    const bottomRow = [...partGroupingsRaw, ...repeat(partValuesRaw, partPivotRaw.length), ...(hasGrandsTotalsColumn ? partValuesTotalized : [])];

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
