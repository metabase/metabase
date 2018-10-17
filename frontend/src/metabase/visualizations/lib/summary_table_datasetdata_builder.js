import type {
  ColumnHeader,
  QueryPlan,
  ResultProvider,
  SummaryTableDatasetData,
  SummaryTableSettings
} from "metabase/meta/types/summary_table";
import type {ColumnName, DatasetData, Column, Row} from "metabase/meta/types/Dataset";
import set from "lodash.set";
import flatMap from "lodash.flatmap";
import zip from "lodash.zip";
import orderBy from "lodash.orderby";
import invert from "lodash.invert";
import {canTotalizeByType} from "metabase/visualizations/lib/settings/summary_table";
import {getAllQueryKeys, getQueryPlan, grandTotalsLabel} from "metabase/visualizations/lib/summary_table";

type RowTemplate = {
  normalPart: ColumnName[],
  pivotPart?: any,
}

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


    return {columnsHeaders :[topRow, bottomRow], cols: bottomRow.map(p => p.column)};
  }
  else {
    const mainRow = [...partGroupingsRaw, ...partValuesRaw];
    return {columnsHeaders : [mainRow], cols : mainRow.map(p => p.column)};
  }
};

const tryCompressColumnsHeaders = ({valuesSources}, columnsHeaders) =>{

  if(valuesSources.length > 1)
    return columnsHeaders;

  const [topRow, bottomRow] =columnsHeaders;
  return [zip(topRow, bottomRow).map(([top, bottom]) => top || bottom)]
};

const getRowTemplate = (columnsHeaders:ColumnHeader[][]) => {

  if(columnsHeaders.length === 1){
    return {normalPart: columnsHeaders[0].map(({column: {name}}) => name )};
  }


  throw new Error("Not implemented exception");
};


const canTotalizeBuilder = (cols: Column[]): (ColumnName => boolean) => {
  const columnNameToType = cols.reduce(
    (acc, { name, base_type }) => ({ ...acc, [name]: base_type }),
    {},
  );
  return p => canTotalizeByType(columnNameToType[p]);
};


const extractRows = ({normalPart}: RowTemplate, [mainData ,pivotColumnData]) => {
  const {columns} = mainData;
  const columnNameToCellIndex = invert(columns);
  const normalPartMapping = normalPart.map(columnName => columnNameToCellIndex[columnName]);

  return mainData.rows.map(row => normalPartMapping.map(i => row[i]));

};

const funGen = columnNumber => {
  let orderedGroupingKeys = [];
  return row => {
    let groupingKey = row[columnNumber];
    let i = orderedGroupingKeys.indexOf(groupingKey);
    if (i < 0) {
      i = orderedGroupingKeys.length;
      orderedGroupingKeys.push(groupingKey);
    }
    return i;
  };
};

const isDefined = value => value || value === 0;

const buildComparer = (ascDescMultiplier, index) => (nextComparer) => (item1, item2) => {

  const value1 = item1[index];
  const value2 = item2[index];

  if(value1 === value2 || !isDefined(value1) && !isDefined(value2)){
    return nextComparer ? nextComparer(item1, item2) : 0;
  }

  if(isDefined(value1) && !isDefined(value2))
    return -1;

  if(!isDefined(value1) && isDefined(value2))
    return 1;

  if(value1 < value2)
    return -1 * ascDescMultiplier;

  return 1 * ascDescMultiplier;

};

const buildUberComparer = (sortOrders) => {

  const ascDescMultiplier = ascDesc => ascDesc === 'asc' ? 1 : -1;

  return sortOrders
    .map(([ascDesc], index) => buildComparer(ascDescMultiplier(ascDesc), index))
    .reverse()
    .reduce((prevCmp, currentPartCmp) => currentPartCmp(prevCmp));
};

//todo: do it better, we can merge in O(n) time
const combineRows = (sortOrder, rowsArray : Row[][]) =>
  flatMap(rowsArray, p => p).sort(buildUberComparer(sortOrder));


const combineData = (rowTemplate: RowTemplate, queryPlan: QueryPlan, resultsProvider: ResultProvider) => {

  const normalizedRows = getAllQueryKeys(queryPlan)
    .map(keys => keys.map(key => resultsProvider(key)))
    .map(results => extractRows(rowTemplate, results));

  const combinedRows = combineRows(queryPlan.sortOrder, normalizedRows);
  return { rows: combinedRows};
};


export const buildDatasetData = (settings: SummaryTableSettings, mainResults: DatasetData, resultsProvider: ResultProvider): SummaryTableDatasetData => {
  const {columnsHeaders, cols} = buildColumnHeaders(settings, mainResults);
  const compressedColumnsHeaders = tryCompressColumnsHeaders(settings, columnsHeaders);
  const rowTemplate = getRowTemplate(columnsHeaders);

  const queryPlan = getQueryPlan(settings, canTotalizeBuilder(mainResults.cols));

  const {rows} = combineData(rowTemplate, queryPlan, resultsProvider);

  return {
    columnsHeaders: compressedColumnsHeaders,
    cols,
    columns: cols.map(p => p.name),
    rows
  };
};
