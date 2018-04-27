import { Row } from "metabase/meta/types/Dataset";
//TODO:
// import {Range} from "metabase/meta/"

type RowGroupsAcc = {
  elementsOrder: Array<any>,
  groupedRows: {},
};

type CellIndexToGroupSizeAcc = {
  groupStartIndexToGroupSize: {},
  groupStopIndexToGroupSize: {},
  currentIndex: Number,
};

export type Style = {
  height: Number,
};

export class GroupingManager {
  rowsOrdered: Row[];
  defaultRowHeight: Number;
  groupStartIndexToGroupSize;
  groupStopIndexToStartIndex;

  constructor( defaultRowHeight : Number, rows: Row[]) {
    this.defaultRowHeight = defaultRowHeight;
    const groupResults = rows.reduce(
      GroupingManager.groupRows(0),
      {
        elementsOrder: [],
        groupedRows: {},
      },
    );
    this.rowsOrdered = groupResults.elementsOrder.flatMap(
      p => groupResults.groupedRows[p],
    );

    const res = groupResults.elementsOrder
      .map(p => groupResults.groupedRows[p].length)
      .reduce(GroupingManager.createRowIndexToGroupSizeMap, {
        groupStartIndexToGroupSize: {},
        groupStopIndexToStartIndex: {},
        currentIndex: 0,
      });
    this.groupStartIndexToGroupSize = res.groupStartIndexToGroupSize;
    this.groupStopIndexToStartIndex = res.groupStopIndexToStartIndex;
  }

  static createRowIndexToGroupSizeMap = (
    {
      groupStartIndexToGroupSize,
      groupStopIndexToStartIndex,
      currentIndex
    }: CellIndexToGroupSizeAcc,
    currentGroupSize: Number,
  ) => {

    groupStartIndexToGroupSize = { ...groupStartIndexToGroupSize, [currentIndex]: currentGroupSize };
    groupStopIndexToStartIndex = { ...groupStopIndexToStartIndex, [currentIndex + currentGroupSize -1]: currentIndex };
    currentIndex = currentIndex + currentGroupSize;

    return { groupStartIndexToGroupSize: groupStartIndexToGroupSize, groupStopIndexToStartIndex : groupStopIndexToStartIndex, currentIndex: currentIndex };
  };

  static groupRows = (
    columnNumber: Number) => (
    acc: RowGroupsAcc,
    row: Row,
  ): RowGroupsAcc  => {
    let { elementsOrder, groupedRows } = acc;

    const groupingKey = row[columnNumber];

    if (!elementsOrder.includes(groupingKey))
      elementsOrder = [...elementsOrder, groupingKey];

    const oldGroup = groupedRows[groupingKey] || [];
    const newGroup = [...oldGroup, row];

    groupedRows = { ...groupedRows, [groupingKey]: newGroup };

    return { elementsOrder: elementsOrder, groupedRows: groupedRows };
  };

  shouldHide = (rowIndex: Number, visibleRowIndexes: Range): Boolean => {
    const firstVisibleRowIndex = visibleRowIndexes.start;

    if ((firstVisibleRowIndex <= rowIndex && this.isFirstInGroup(rowIndex, firstVisibleRowIndex))
      || firstVisibleRowIndex < rowIndex && this.isLastInFirstVisibleGroup(rowIndex, firstVisibleRowIndex))
      return false;

    console.log(rowIndex);
    console.log(visibleRowIndexes);

    return true;
  };

  isFirstInGroup = (rowIndex: Number) : Boolean => rowIndex in this.groupStartIndexToGroupSize;

  isLastInFirstVisibleGroup = (rowIndex: Number, firstVisibleRowIndex: Number) =>{
    if(!(rowIndex in this.groupStopIndexToStartIndex))
      return false;

    const firstRowInGroup = this.groupStopIndexToStartIndex[rowIndex];
    return firstRowInGroup < firstVisibleRowIndex;
  };

  mapStyle = (rowNumber: Number, visibleRowIndexes: Range, cellStyle: {}): {} => {
    if ("height" in cellStyle) {
      console.log(this.groupStartIndexToGroupSize);
      if(this.isFirstInGroup(rowNumber))
      {
        console.log('firstInGroup');
        console.log(rowNumber);
        console.log(visibleRowIndexes);
        console.log(cellStyle.height);
        const rowSpan = this.getRowSpan(rowNumber);
        console.log("h " +cellStyle.height);
        console.log("span " +rowSpan);
        const visibleRealRowSpan = Math.min(rowSpan, visibleRowIndexes.stop - rowNumber + 1);
        console.log("v span " +visibleRealRowSpan);
        const res = { ...cellStyle, height: (this.defaultRowHeight * visibleRealRowSpan), 'flex-direction': 'column' };
        console.log(res);
        return res;
      }
      else {
        console.log('lastInGroup');
        console.log(rowNumber);
        console.log(visibleRowIndexes);
        const tmp = this.groupStopIndexToStartIndex[rowNumber];
        const rowSpan = this.getRowSpan(tmp);
        console.log("h " +cellStyle.height);
        console.log("span " +rowSpan);
        const visibleRealRowSpan = Math.min(rowSpan, rowNumber + 1 - visibleRowIndexes.start);
        console.log("v span " +visibleRealRowSpan);
        const res =  { ...cellStyle, height: (this.defaultRowHeight * visibleRealRowSpan), top : (cellStyle.top - this.defaultRowHeight * visibleRealRowSpan), 'flex-direction': 'column' };
        console.log(res);
        return res;
      }
    }
    return cellStyle;
  };

  getRowSpan = (rowNumber: Number): Number => this.groupStartIndexToGroupSize[rowNumber];

}
