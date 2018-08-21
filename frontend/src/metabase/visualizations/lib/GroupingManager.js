import {Row} from "metabase/meta/types/Dataset";
import _ from 'lodash';
import flatMap from 'lodash.flatmap';
import unset from 'lodash.unset';
import orderBy from 'lodash.orderby';
import {
  COLUMNS_SETTINGS,
} from "metabase/visualizations/visualizations/SummaryTable";
import type {AggregationKey, QueryPlan, ResultProvider, SummaryTableSettings} from "metabase/meta/types/summary_table";
import {
  getAllQueryKeys,
  getColumnsFromSettings, mainKey
} from "metabase/visualizations/lib/settings/summary_table";
import type {ColumnName, Column} from "metabase/meta/types/Dataset";

type ColumnAcc = {
  prevRow : Row,
  firstInGroupIndexes : Set
}

//todo: change class to function prepareSummaryData
export class GroupingManager {
  defaultRowHeight: Number;
  columnIndexToFirstInGroupIndexes: {};
  rows: Row[];
  cols;
  settings;
  probeRows: Row[];
  probeCols;
  valueColsLen = 1;


  constructor( defaultRowHeight: Number, settings, rawCols, rp : ResultProvider, qp : QueryPlan) {
    this.defaultRowHeight = defaultRowHeight;
    this.settings = settings;
    const summaryTableSettings = settings[COLUMNS_SETTINGS];

    const summarySettings: SummaryTableSettings = settings[COLUMNS_SETTINGS];
    const isPivoted = summarySettings.columnsSource.length > 0;
    const columnsIndexesForGrouping =[...new Array((summaryTableSettings.groupsSources || []).length + (isPivoted ? 1 : 0)).keys()];
    const getAscDesc = colName => (summarySettings.columnNameToMetadata[colName] || {}).isAscSortOrder;
    const sortOrderMethod = columnsIndexesForGrouping.map(funGen);
    const mainSsortOrderMethod = columnsIndexesForGrouping.map(getValueByIndex);
    const ascDesc = (summaryTableSettings.groupsSources || []).map(getAscDesc)
      .map(isAsc => isAsc ? 'asc' : 'desc' );



    const normalizedRows = getAllQueryKeys(qp, canTotalizeBuilder(rawCols))
      .map(keys =>[flatMap(keys , key => normalizeRows(settings, rp(key))), keys])
      .map(res => res[1].includes(mainKey) ? [sortMainGroup(res[0], mainSsortOrderMethod, ascDesc), res[1]] : res)
      .map(res => isPivoted ? [pivotRows(res[0], sortOrderMethod), res[1]] : res)
      .map(([rows, keys]) => tryAddColumnTotalIndex(rows, keys, summarySettings.columnsSource[0]));

    const tmp = getAvailableColumnIndexes(settings, rawCols);
    let cols = tmp.map(p => rawCols[p[0]]).map((col, i) => ({...col, getValue: getValueByIndex(i)}));
    this.probeCols = cols;
    //
    const rows = [].concat(...normalizedRows);
    //
    this.rows = _.sortBy(rows, sortOrderMethod);
    const foo = getFirstInGroupMap(this.rows);
    const res = columnsIndexesForGrouping.map(foo).map(p => p.firstInGroupIndexes);
    const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;
    const res3 = res2.map((v, i) => [columnsIndexesForGrouping[i], v]);
    if(isPivoted){
      const pivotColumnNumber = columnsIndexesForGrouping.length;
      const columns = Set.of(...Array.from([].concat(...this.rows.map(p => Object.getOwnPropertyNames(p.piv)))));
      const hasUndef = columns.delete('undefined');
      const pivotedColumns = orderBy([...columns], p => p, getAscDesc(summarySettings.columnsSource[0])? 'asc' : 'desc');
      if(hasUndef)
        pivotedColumns.push(undefined);

      const tmp = getAvailableColumnIndexes(settings, rawCols);
      const colsTmp = tmp.map(p => rawCols[p[0]]).map((col, i) => ({...col, getValue: getValueByIndex(i)}));

      this.columnIndexToFirstInGroupIndexes = res3.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});
      const grColumnsLength = (summarySettings.groupsSources || []).length;
      const grCols = colsTmp.slice(0, grColumnsLength).map((col, i) => ({...col, getValue: getValueByIndex(i), parentName: ["",1] }));
      const values = colsTmp.slice(grColumnsLength + 1);
      const tt = pivotedColumns.map(k => [getPivotValue(k, grColumnsLength+1), k]).map(([getValue, k]) => values.map((col, i) => ({...col, getValue: getValue(i), parentName: i === 0 ? [k ? k : 'Grand totals' , values.length, k ? colsTmp[grColumnsLength] : undefined ] : undefined})).filter(col => k !== undefined || canTotalize(col.base_type)));
      this.probeCols = grCols.concat(tt[0]);
      this.valueColsLen = (tt[0] || []).length;
      cols = grCols.concat(...tt);
      unset(this.columnIndexToFirstInGroupIndexes, columnsIndexesForGrouping.length-1);
    }
    else
      this.columnIndexToFirstInGroupIndexes = res3.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});

    this.probeRows = [this.rows[this.rows.length -1], ...cols.map(p => this.rows.find(row => p.getValue(row))).filter(p => p)]
    this.cols = cols;

  }





  isVisible = (rowIndex: Number, columnIndex: Number, visibleRowIndices: Range): Boolean => {

    if(rowIndex < visibleRowIndices.start  || visibleRowIndices.stop < rowIndex)
      return false;

    if(!(this.isGrouped(columnIndex)))
      return true;

    if(rowIndex === visibleRowIndices.start)
      return true;

    return rowIndex in this.columnIndexToFirstInGroupIndexes[columnIndex];
  };

  isGrouped = (columnIndex : Number) => columnIndex in this.columnIndexToFirstInGroupIndexes;


  mapStyle = (rowIndex: Number, columnIndex: Number, visibleRowIndices: Range, cellStyle: {}): {} => {

    let res = cellStyle;
    if(columnIndex in this.columnIndexToFirstInGroupIndexes) {
      if ("height" in cellStyle) {
        const tmp = this.columnIndexToFirstInGroupIndexes[columnIndex];
        const ri = getFirstRowInGroupIndex(tmp, rowIndex);
        const endIndex = tmp[ri];
        // const visibleEndIndex = Math.min(endIndex, visibleRowIndices.stop);
        const rowSpan = endIndex - ri + 1;
        const top  = cellStyle.top - this.defaultRowHeight * (rowIndex  - ri);
        const height = this.defaultRowHeight * rowSpan;
        res = {...cellStyle, top: top, height: height, 'display': 'block', 'padding-top' : '.25em'};

      }
      res = {...res, background: '#F8F9FA'}
    }

    return res;
  };

  getRowSpan = (rowIndex: Number, columnIndex: Number, visibleRowIndices: Range): Number => {

    if(columnIndex in this.columnIndexToFirstInGroupIndexes) {
        const tmp = this.columnIndexToFirstInGroupIndexes[columnIndex];
        const ri = getFirstRowInGroupIndex(tmp, rowIndex);
        const endIndex = tmp[ri];
        const visibleStartIndex = Math.max(rowIndex, ri)
        const visibleEndIndex = Math.min(endIndex, visibleRowIndices.stop);
        const rowSpan = visibleEndIndex - visibleStartIndex + 1;
        return rowSpan;
    }
    return 1;
  };

  createKey = (rowIndex: Number, columnIndex: Number) =>{
    const firstIndexesInGroup = this.columnIndexToFirstInGroupIndexes[columnIndex];
    if(!firstIndexesInGroup)
      return rowIndex + '-' +columnIndex;

    const ri = getFirstRowInGroupIndex(firstIndexesInGroup, rowIndex);

    return ri + '-' +columnIndex;
  }
}


const canTotalizeBuilder = (cols : Column[]): (ColumnName => boolean) =>{
  const columnNameToType = cols.reduce((acc, {name, base_type})=>({...acc, [name]: base_type}), {});
  return p => canTotalize(columnNameToType[p]);
};

const sortMainGroup = (rows : Row[], sortOrderMethod : methods[], ascDesc: string[]) => _.orderBy(rows, sortOrderMethod, ascDesc);

const getValueByIndex = (index : Number) => (row ) => row[index];
const getPivotValue = (key, offset ) => (index: Number) => row => (row.piv[key] || [])[index + offset];

//todo change name, add comment
const funGen = columnNumber => {

  let orderedGroupingKeys = [];
  return row => {
    let groupingKey = row[columnNumber];
    let i = orderedGroupingKeys.indexOf(groupingKey);
    if(i < 0){
      i = orderedGroupingKeys.length;
      orderedGroupingKeys.push(groupingKey);
    }
    return i;
  }
};

const hasTheSameValueByColumn = (columnIndex : Number) => (row1 : Row, row2 : Row) : Boolean => row1[columnIndex] === row2[columnIndex];
const getRow = (rows : Row[]) => (rowIndex: Number) : Row => rows[rowIndex] || [];


const isFirstInGroup = (columns: Number[], rows : Row[]) => (rowIndex: Number): Boolean => {
  const prevRow = getRow(rows)(rowIndex - 1);
  const currentRow = getRow(rows)(rowIndex);
  return columns.reduce(false, (acc, columnIndex) => acc || !hasTheSameValueByColumn(columnIndex)(prevRow, currentRow)) ;
};

const updateFirstInGroup = (hasTheSameValue, columnIndex) => ({prevRow, firstInGroupIndexes}: ColumnAcc, currentRow, index: Number) => {
  if(!hasTheSameValue(prevRow, currentRow) || currentRow.isTotalColumnIndex === columnIndex + 1)
    firstInGroupIndexes.add(index);

  return {prevRow : currentRow, firstInGroupIndexes};
};



const getFirstRowInGroupIndex = (firstInGroup, rowIndex: Number) : Number => {
  while(!(rowIndex in firstInGroup))
    rowIndex--;

  return rowIndex;
};

const getStartGroupIndexToEndGroupIndex = (startIndexes : Set) : {} =>{
  const sortedIndexes = _.sortBy(Array.from(startIndexes));
  const [x, ...tail] = sortedIndexes;
  return tail.reduce((acc, currentValue, index) => {acc[sortedIndexes[index]] = currentValue - 1; return acc}, {});
};


const createUberRows = (pivotIndex, values) =>{
  const piv = values.reduce((acc, value) => ({...acc, [value[pivotIndex]] : [...(acc[value[pivotIndex]] || []), value] }), {});
  const properties = Object.getOwnPropertyNames(piv);
  const resPart = _.zip(...properties.map(propName => piv[propName]));
  const aa = resPart.map(arr => properties.reduce((acc, propName, i) => ({...acc, [propName] : arr[i]}), {}));
  return aa.map(piv => ({piv, __proto__ : values[0]}));
}

////////////////////////////////////

const getFirstInGroupMap = (rows:Row) => (columnIndex :  Number) => {
  return rows.reduce(updateFirstInGroup(hasTheSameValueByColumn(columnIndex), columnIndex), {
    prevRow: [],
    firstInGroupIndexes: new Set().add(0).add((rows.length))
  });
};

const getAvailableColumnIndexes = (settings,  cols) => getColumnsFromSettings(settings[COLUMNS_SETTINGS])
  .map(f => [_.findIndex(cols, c => c.name === f), f])
  .filter(i => i[0] < cols.length);



const normalizeRows = (settings, { cols, rows }) => {
  const columnIndexes = getAvailableColumnIndexes(settings, cols).map(p => p[0]);
  return rows.map(row => columnIndexes.map(i => row[i]));
};

const tryAddColumnTotalIndex = (rows : Row[], keys : AggregationKey[], columnSource : string) : Row[] =>
{
  if(keys.includes(mainKey))
    return rows;

  const groupings = keys[0][0];
  const pivotCorrection = groupings.has(columnSource) ? 1 : 0;

  const isTotalColumnIndex = groupings.size - pivotCorrection;
  return rows.map(row => ({__proto__: row, isTotalColumnIndex}));
};


const pivotRows = (rows, cmp) =>{
  const rowsOrdered = _.sortBy(rows, cmp);

  const foo = getFirstInGroupMap(rowsOrdered);
  const res = [...cmp.keys()].map(foo).map(p => p.firstInGroupIndexes);
  const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;

  const pivotColumnNumber = cmp.length - 1;
  const dd = _.sortBy(Array.from(res2[res2.length -2] || []));
  const [x, ...tail] = dd;
  const ttttttttttt = tail.reduce((acc, currentValue, index) => {acc[dd[index]] = currentValue - 1; return acc}, {});
  const functionf = v => createUberRows(pivotColumnNumber, v);
  const grouped = [].concat(...Object.getOwnPropertyNames(ttttttttttt).map(start => rowsOrdered.slice(start, ttttttttttt[start]+1)).map(functionf));

  return grouped;
}

//todo remove, use from SummaryTableQueryBuilder
const canTotalize = (type : string) => type ==='type/Integer' || type === 'type/Float' || type === 'type/Decimal';
