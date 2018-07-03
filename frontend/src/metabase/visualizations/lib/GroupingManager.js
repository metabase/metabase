import {Row} from "metabase/meta/types/Dataset";
import _ from 'lodash';
import {COLUMNS_SETTINGS} from "metabase/visualizations/visualizations/SummaryTable";
import {getColumnsFromSettings} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";

type ColumnAcc = {
  prevRow : Row,
  firstInGroupIndexes : Set
}

export class GroupingManager {
  defaultRowHeight: Number;
  columnIndexToFirstInGroupIndexes: {};
  rows: Row[];
  pivotedColumns: any[];
  cols;
  settings;


  constructor( defaultRowHeight: Number, data, settings, rawSeries) {

    this.settings = settings;
    const colsRaw = data.cols;

    const columnNameIndexes = this.getColumnIndexes(settings, colsRaw);
    const cols = columnNameIndexes.map(p => colsRaw[p[0]])

    const columnIndexes = columnNameIndexes.map(p => p[0]);
    const fooBar = columnNameIndexes.map((p, index) => [(settings[COLUMNS_SETTINGS].columnNameToMetadata[p[1]] || {}).showTotals,index]).filter(p => p[0]).map(p => p[1]).reverse();
    const rowsRaw = rawSeries.map((p, index) => this.normalizeRows(settings, p.data, fooBar[index - 1]));

    const rows = [].concat(...rowsRaw);

    const isPivoted = (settings[COLUMNS_SETTINGS].columnsSource || []).length >= 1;
    const columnsIndexesForGrouping =[...new Array((settings[COLUMNS_SETTINGS].groupsSources || []).length + (isPivoted ? 1 : 0)).keys()];

    this.defaultRowHeight = defaultRowHeight;
    this.rows = _.sortBy(rows, columnsIndexesForGrouping.map(funGen));
    const foo = getFirstInGroupMap(this.rows);
    const res = columnsIndexesForGrouping.map(foo).map(p => p.firstInGroupIndexes);
    const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;
    const res3 = res2.map((v, i) => [columnsIndexesForGrouping[i], v]);
    if(isPivoted)
    {
      const lastGroupIndex = columnsIndexesForGrouping[columnsIndexesForGrouping.length - 2];
      const pivotColumnNumber = columnsIndexesForGrouping[columnsIndexesForGrouping.length - 1];
      const columns = new Set(Array.from(this.rows.map(p => p[pivotColumnNumber])));
      // columns.delete(undefined);
      this.pivotedColumns = Array.from(columns);

      const dd = _.sortBy(Array.from(res3[res3.length -2][1]));
      const [x, ...tail] = dd;
      const ttttttttttt = tail.reduce((acc, currentValue, index) => {acc[dd[index]] = currentValue - 1; return acc}, {});
      const functionf = v => createUberRow(pivotColumnNumber, v);
      const grouped = Object.getOwnPropertyNames(ttttttttttt).map(start => this.rows.slice(start, ttttttttttt[start]+1)).map(functionf);
      const foo_ = getFirstInGroupMap(grouped);
      const res_ = columnsIndexesForGrouping.slice(0,columnsIndexesForGrouping.length -2).map(foo_).map(p => p.firstInGroupIndexes);
      const res2_ = res_.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;
      const res3_ = res2_.map((v, i) => [columnsIndexesForGrouping[i], v]);
      this.rows = grouped;
      this.columnIndexToFirstInGroupIndexes = res3_.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});
      const grCols = cols.slice(0, columnsIndexesForGrouping.length - 1).map((col, i) => ({...col, getValue: getValueByIndex(i)}));
      const values = cols.slice(columnsIndexesForGrouping.length);
      const tt = this.pivotedColumns.map(k => [getPivotValue(k, columnsIndexesForGrouping.length), k]).map(([getValue, k]) => values.map((col, i) => ({...col, getValue: getValue(i), parentName: k})))

      this.cols = grCols.concat(...tt)
    }
    else
    {
      this.cols = cols.map((col, i) => ({...col, getValue: getValueByIndex(i)}));
      this.columnIndexToFirstInGroupIndexes = res3.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});
    }
  }

  getColumnIndexes = (settings,  cols) => getColumnsFromSettings(settings[COLUMNS_SETTINGS])
    .map(f => [_.findIndex(cols, c => c.name === f), f])
    .filter(i => i[0] < cols.length);


  normalizeRows = (settings, { cols, rows }, isTotalColumnIndex) : DatasetData => {
    const columnIndexes = this.getColumnIndexes(settings, cols).map(p => p[0]);
    const res = rows.map(row => columnIndexes.map(i => row[i])).map(p => ({isTotalColumnIndex : isTotalColumnIndex, __proto__ : p}));
    return res;
  };


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

    if(columnIndex in this.columnIndexToFirstInGroupIndexes) {
      if ("height" in cellStyle) {
        const tmp = this.columnIndexToFirstInGroupIndexes[columnIndex];
        const ri = getFirstRowInGroupIndex(tmp, rowIndex);
        const endIndex = tmp[ri];
        // const visibleEndIndex = Math.min(endIndex, visibleRowIndices.stop);
        const rowSpan = endIndex - ri + 1;
        const top  = cellStyle.top - this.defaultRowHeight * (rowIndex  - ri);
        const height = this.defaultRowHeight * rowSpan;
        const res = {...cellStyle, top: top, height: height, 'display': 'block', 'padding-top' : '.25em'};
        return res;
      }
    }
    return cellStyle;
  };



}

const getValueByIndex = (index : Number) => (row ) => row[index];
const getPivotValue = (key, offset ) => (index: Number) => row => ((row.piv[key] || [])[0] || [])[index + offset];

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

const getFirstInGroupMap = (rows:Row) => (columnIndex :  Number) => {
  return rows.reduce(updateFirstInGroup(hasTheSameValueByColumn(columnIndex), columnIndex), {
    prevRow: [],
    firstInGroupIndexes: new Set().add(0).add((rows.length))
  });
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


const createUberRow = (pivotIndex, values) =>{
  const piv = values.reduce((acc, value) => ({...acc, [value[pivotIndex]] : [...(acc[value[pivotIndex]] || []), value] }), {});
  const res = {piv};
  res.__proto__ = values[0];

  return res;
}

