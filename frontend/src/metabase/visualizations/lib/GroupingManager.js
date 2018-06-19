import {Row} from "metabase/meta/types/Dataset";
import _ from 'lodash';

type ColumnAcc = {
  prevRow : Row,
  firstInGroupIndexes : Set
}

export class GroupingManager {
  defaultRowHeight: Number;
  columnIndexToFirstInGroupIndexes: {};
  rowsOrdered: Row[];


  constructor( defaultRowHeight: Number, columnsIndexesForGrouping: Number[], rows: Row[]) {
    this.defaultRowHeight = defaultRowHeight;
    this.rowsOrdered = _.sortBy(rows, columnsIndexesForGrouping.map(funGen));
    const foo = getFirstInGroupMap(this.rowsOrdered);
    const res = columnsIndexesForGrouping.map(foo).map(p => p.firstInGroupIndexes);
    const res2 = res.reduce(({resArr, prevElem}, elem) =>{const r = new Set([...prevElem, ...elem]); resArr.push(r); return {resArr, prevElem : r} },{ resArr: [], prevElem : new Set()}).resArr;
    const res3 = res2.map((v, i) => [columnsIndexesForGrouping[i], v]);
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

    if(columnIndex in this.columnIndexToFirstInGroupIndexes)
    {
    if ("height" in cellStyle) {
      const tmp = this.columnIndexToFirstInGroupIndexes[columnIndex];
      const ri = getFirstRowInGroupIndex(tmp, rowIndex);
      const endIndex = tmp[ri];

      const visibleEndIndex = Math.min(endIndex, visibleRowIndices.stop);
      const rowSpan = visibleEndIndex - rowIndex + 1;
      console.log("before change:", cellStyle);
        const res = {...cellStyle, height: (this.defaultRowHeight * rowSpan), 'display': 'block', 'padding-top' : '.25em'};
      console.log("after change:", res);
        return res;

      }
    }
    // }
    return cellStyle;
  };



}

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

const updateFirstInGroup = (hasTheSameValue) => ({prevRow, firstInGroupIndexes}: ColumnAcc, currentRow, index: Number) => {
  if(!hasTheSameValue(prevRow, currentRow) || currentRow.isTotal)
    firstInGroupIndexes.add(index);

  return {prevRow : currentRow, firstInGroupIndexes};
};

const getFirstInGroupMap = (rows:Row) => (columnIndex :  Number) => {
  return rows.reduce(updateFirstInGroup(hasTheSameValueByColumn(columnIndex)), {
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




