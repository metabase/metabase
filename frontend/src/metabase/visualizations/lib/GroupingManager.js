import {Row} from "metabase/meta/types/Dataset";
import _ from 'lodash';
import {COLUMNS_SETTINGS} from "metabase/visualizations/visualizations/SummaryTable";
import StateSerialized, {getColumnsFromSettings, GROUPS_SOURCES, COLUMNS_SOURCE, VALUES_SOURCES} from "metabase/visualizations/components/settings/SummaryTableColumnsSetting";

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


  constructor( defaultRowHeight: Number, settings, rawSeries) {
    this.defaultRowHeight = defaultRowHeight;
    const rawCols = rawSeries[0].data.cols;
    this.settings = settings;
    const datas = rawSeries.map(p => p.data);
    const summaryTableSettings = settings[COLUMNS_SETTINGS];

    const isPivoted = settings[COLUMNS_SETTINGS].columnsSource;


    let mappedRows = undefined;
    let cols = undefined;
    if(isPivoted){
      const columnsIndexesForGrouping =[...new Array((summaryTableSettings.groupsSources || []).length + (isPivoted ? 1 : 0)).keys()];
      const sortOrderMethod = columnsIndexesForGrouping.map(funGen);
      let normalizedRows = datas.map(p => normalizeRows(settings, p))

      if((settings[COLUMNS_SETTINGS].columnNameToMetadata[settings[COLUMNS_SETTINGS][COLUMNS_SOURCE]] || {}).showTotals)
      {
        const totalLen = settings[COLUMNS_SETTINGS][GROUPS_SOURCES].filter(p => (settings[COLUMNS_SETTINGS].columnNameToMetadata[p] || {}).showTotals).length + 1;
        const suff = [...normalizedRows.slice(normalizedRows.length - totalLen)];
        normalizedRows = [...normalizedRows.slice(0, normalizedRows.length - totalLen)];//+1 == mainRes, +1 == pivot


        for(let i = 2; i < normalizedRows.length; i++)
        {
          normalizedRows[i] = [...normalizedRows[i], ...suff[i-2]];

        }

        if(normalizedRows.length > 1){
          //normalizedRows[1] - grand total column
          normalizedRows[0] = [...normalizedRows[0], ... normalizedRows[1]]
          normalizedRows[1] = [];
        }
      }

      mappedRows = normalizedRows.map(rows => pivotRows(rows, sortOrderMethod))
    } else {
      mappedRows = datas.map(p => normalizeRows(settings, p));

      const tmp = getAvailableColumnIndexes(settings, rawCols);
      cols = tmp.map(p => rawCols[p[0]]).map((col, i) => ({...col, getValue: getValueByIndex(i)}));
      this.probeCols = cols;
    }
    const columnsIndexesForGrouping =[...new Array((summaryTableSettings.groupsSources || []).length).keys()];
    const sortOrderMethod = columnsIndexesForGrouping.map(funGen);

    const fooBar = ([...(settings[COLUMNS_SETTINGS][GROUPS_SOURCES] || []),...(settings[COLUMNS_SETTINGS][COLUMNS_SOURCE] ? [settings[COLUMNS_SETTINGS][COLUMNS_SOURCE]] : [])]).map((p, index) => [(settings[COLUMNS_SETTINGS].columnNameToMetadata[p] || {}).showTotals,index]).filter(p => p[0]).map(p => p[1]).reverse();

    mappedRows = mappedRows.map((rs, index) => rs.map(r => ({__proto__ : r, isTotalColumnIndex :fooBar[index - 1]})));

    const rows = [].concat(...mappedRows);

    this.rows = _.sortBy(rows, sortOrderMethod);
    const foo = getFirstInGroupMap(this.rows);
    const res = columnsIndexesForGrouping.map(foo).map(p => p.firstInGroupIndexes);
    const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;
    const res3 = res2.map((v, i) => [columnsIndexesForGrouping[i], v]);
    if(isPivoted){
      const pivotColumnNumber = columnsIndexesForGrouping.length;
      const columns = new Set(Array.from([].concat(...this.rows.map(p => Object.getOwnPropertyNames(p.piv)))));

      const pivotedColumns = _.sortBy(Array.from(columns));
      const tmp = getAvailableColumnIndexes(settings, rawCols);
      const colsTmp = tmp.map(p => rawCols[p[0]]).map((col, i) => ({...col, getValue: getValueByIndex(i)}));
      // this.probeRowIndexes = [...colsTmp.map(col => this.rows.indexOf(row => col.getValue(row)))];

      this.columnIndexToFirstInGroupIndexes = res3.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});
      const grColumnsLength = (settings[COLUMNS_SETTINGS][GROUPS_SOURCES] || []).length;
      const grCols = colsTmp.slice(0, grColumnsLength).map((col, i) => ({...col, getValue: getValueByIndex(i), parentName: ["",1] }));
      const values = colsTmp.slice(grColumnsLength + 1);
      const tt = pivotedColumns.map(k => [getPivotValue(k, grColumnsLength+1), k]).map(([getValue, k]) => values.map((col, i) => ({...col, getValue: getValue(i), parentName: i === 0 ? [k === 'undefined' ? 'Grand totals' : k, values.length, k === 'undefined' ? undefined : colsTmp[grColumnsLength]] : undefined})).filter(col => k !== 'undefined' || canTotalize(col.base_type)))
      this.probeCols = grCols.concat(tt[0]);
      this.valueColsLen = (tt[0] || []).length;
      cols = grCols.concat(...tt)
    }

    this.probeRows = [this.rows[this.rows.length -1], ...cols.map(p => this.rows.find(row => p.getValue(row)))]
    this.cols = cols;
    this.columnIndexToFirstInGroupIndexes = res3.reduce((acc, [columnIndex,value]) => {acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value); return acc;}, {});
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

}

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


const pivotRows = (rows, cmp) =>{
  const rowsOrdered = _.sortBy(rows, cmp);

  const foo = getFirstInGroupMap(rowsOrdered);
  const res = [...cmp.keys()].map(foo).map(p => p.firstInGroupIndexes);
  const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;

  const pivotColumnNumber = cmp.length - 1;
  // columns.delete(undefined);

  const dd = _.sortBy(Array.from(res2[res2.length -2]));
  const [x, ...tail] = dd;
  const ttttttttttt = tail.reduce((acc, currentValue, index) => {acc[dd[index]] = currentValue - 1; return acc}, {});
  const functionf = v => createUberRows(pivotColumnNumber, v);
  const grouped = [].concat(...Object.getOwnPropertyNames(ttttttttttt).map(start => rowsOrdered.slice(start, ttttttttttt[start]+1)).map(functionf));

  return grouped;
}

//todo remove, use from SummaryTableQueryBuilder
const canTotalize = (type : string) => type ==='type/Integer' || type === 'type/Float' || type === 'type/Decimal';
