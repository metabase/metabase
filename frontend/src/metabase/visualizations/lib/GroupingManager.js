import {Row} from "metabase/meta/types/Dataset";
import _ from 'lodash';


export class GroupingManager {
  indexesOfGroupedColumns : Number[];
  rowsOrdered: Row[];
  defaultRowHeight: Number;


  constructor(defaultRowHeight: Number, rows: Row[]) {
    const i = 0;
    this.defaultRowHeight = defaultRowHeight;
    this.rowsOrdered = _.sortBy(rows, funGen(i));
    this.indexesOfGroupedColumns = [i];
  }


  shouldHide = (rowIndex: Number, visibleRowIndexes: Range): Boolean => {
    const firstVisibleRowIndex = visibleRowIndexes.start;

    if ((firstVisibleRowIndex <= rowIndex && isFirstInGroup(this.rowsOrdered)(rowIndex)))//, firstVisibleRowIndex))
      // || firstVisibleRowIndex < rowIndex && isLastInGroup(this.rowsOrdered)(rowIndex))// this.isLastInFirstVisibleGroup(rowIndex, firstVisibleRowIndex))
      return false;

    // console.log(rowIndex);
    // console.log(visibleRowIndexes);

    return true;
  };



  //
  //
  // isLastInFirstVisibleGroup = (rowIndex: Number, firstVisibleRowIndex: Number) => {
  //   if (!(rowIndex in this.groupStopIndexToStartIndex))
  //     return false;
  //
  //   const firstRowInGroup = this.groupStopIndexToStartIndex[rowIndex];
  //   return firstRowInGroup < firstVisibleRowIndex;
  // };

  mapStyle = (rowIndex: Number, visibleRowIndexes: Range, cellStyle: {}): {} => {
    if ("height" in cellStyle) {
      // console.log(this.groupStartIndexToGroupSize);
      if (isFirstInGroup(rowIndex)) {
        // console.log('firstInGroup');
        // console.log(rowIndex);
        // console.log(visibleRowIndexes);
        // console.log(cellStyle.height);
        const rowSpan = getRowSpan(this.rowsOrdered)(rowIndex);
        // console.log(rowSpan);
        // console.log("h " + cellStyle.height);
        // console.log("span " + rowSpan);
        const visibleRealRowSpan = Math.min(rowSpan, visibleRowIndexes.stop - rowIndex + 1);
        // console.log("v span " + visibleRealRowSpan);
        const res = {...cellStyle, height: (this.defaultRowHeight * visibleRealRowSpan), 'flex-direction': 'column'};
        // console.log(res);
        return res;
      }
      // else {
      //   console.log('lastInGroup');
      //   console.log(rowIndex);
      //   console.log(visibleRowIndexes);
      //   const tmp = this.groupStopIndexToStartIndex[rowIndex];
      //   const rowSpan = this.getRowSpan(tmp);
      //   console.log("h " + cellStyle.height);
      //   console.log("span " + rowSpan);
      //   const visibleRealRowSpan = Math.min(rowSpan, rowIndex + 1 - visibleRowIndexes.start);
      //   console.log("v span " + visibleRealRowSpan);
      //   const res = {
      //     ...cellStyle,
      //     height: (this.defaultRowHeight * visibleRealRowSpan),
      //     top: (cellStyle.top - this.defaultRowHeight * visibleRealRowSpan),
      //     'flex-direction': 'column'
      //   };
      //   console.log(res);
      //   return res;
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

const hasTheSameValue = (columnIndex : Number) => (row1 : Row, row2 : Row) : Boolean => row1[columnIndex] === row2[columnIndex];
const getRow = (rows : Row[]) => (rowIndex: Number) : Row => rows[rowIndex] || [];


const isFirstInGroup = (rows : Row[]) => (rowIndex: Number): Boolean => {
  const prevRow = getRow(rows)(rowIndex - 1);
  const currentRow = getRow(rows)(rowIndex);
  return !hasTheSameValue(0)(prevRow, currentRow);
};

const isLastInGroup = (rows : Row[]) => (rowIndex: Number): Boolean => {
  const currentRow = getRow(rows)(rowIndex);
  const nextRow = getRow(rows)(rowIndex + 1);
  return !hasTheSameValue(0)(currentRow, nextRow);
};

const getRowSpan = (rows : Row[]) =>(rowIndex: Number): Number => {
  const currentRow = getRow(rows)(rowIndex);
  let currentRowIndex = rowIndex;
  while(currentRowIndex < rows.length){
    const tmpRow = getRow(rows)(currentRowIndex);
    if(!hasTheSameValue(0)(tmpRow, currentRow))
      return currentRowIndex - rowIndex;

    currentRowIndex ++;
  }

  return currentRowIndex - rowIndex;
};




