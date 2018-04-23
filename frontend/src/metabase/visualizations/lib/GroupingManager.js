import { Row } from "metabase/meta/types/Dataset";

type RowGroupsAcc = {
  elementsOrder: Array<any>,
  groupedRows: {},
};

type CellIndexToGroupSizeAcc = {
  cellIndexToSize: {},
  currentIndex: Number,
};

export type Style = {
  height: Number,
};

export class GroupingManager {
  rowsOrdered: Row[];
  cellIndexToSize;

  constructor(rows: Row[]) {
    const groupResults = rows.reduce(
      (acc, row) => GroupingManager.groupRows(0, acc, row),
      {
        elementsOrder: [],
        groupedRows: {},
      },
    );
    this.rowsOrdered = groupResults.elementsOrder.flatMap(
      p => groupResults.groupedRows[p],
    );

    this.cellIndexToSize = groupResults.elementsOrder
      .map(p => groupResults.groupedRows[p].length)
      .reduce(GroupingManager.createRowIndexToGroupSizeMap, {
        cellIndexToSize: {},
        currentIndex: 0,
      }).cellIndexToSize;
  }

  static createRowIndexToGroupSizeMap(
    acc: CellIndexToGroupSizeAcc,
    currentGroupSize: Number,
  ) {
    let { cellIndexToSize, currentIndex } = acc;

    cellIndexToSize = { ...cellIndexToSize, [currentIndex]: currentGroupSize };
    currentIndex = currentIndex + currentGroupSize;

    return { cellIndexToSize: cellIndexToSize, currentIndex: currentIndex };
  }

  static groupRows(
    columnNumber: Number,
    acc: RowGroupsAcc,
    row: Row,
  ): RowGroupsAcc {
    let { elementsOrder, groupedRows } = acc;

    const groupingKey = row[columnNumber];

    if (!elementsOrder.includes(groupingKey))
      elementsOrder = [...elementsOrder, groupingKey];

    const oldGroup = groupedRows[groupingKey] || [];
    const newGroup = [...oldGroup, row];

    groupedRows = { ...groupedRows, [groupingKey]: newGroup };

    return { elementsOrder: elementsOrder, groupedRows: groupedRows };
  }

  shouldHide(rowNumber: Number, _rowStartIndex: Number): Boolean {
    if (rowNumber === _rowStartIndex || rowNumber in this.cellIndexToSize)
      return false;

    return true;
    // var frn = this.getFirstRowGroupNr(_rowStartIndex);
    // if(frn)
    //
    // let tmpNumber = rowNumber -1;
    //
    // while(_rowStartIndex <= tmpNumber){
    //   if(rowNumber in this.cellIndexToSize)
    //     return true;
    //
    //   tmpNumber = tmpNumber -1;
    // }
    //
    // return false;
  }

  mapStyle(rowNumber: Number, _rowStartIndex: Number, cellStyle: {}): {} {
    if ("height" in cellStyle) {
      const rowSpan = this.getRowSpan(rowNumber);
      return { ...cellStyle, height: cellStyle.height * rowSpan };
    }
    return cellStyle;
  }

  getRowSpan(rowNumber: Number): Number {
    const rn = this.getFirstRowGroupNr(rowNumber);
    const rowSpan = this.cellIndexToSize[rn] - (rowNumber - rn);
    return rowSpan;
  }

  getFirstRowGroupNr(rowNumber: Number): Number {
    let currentRowNumber = rowNumber;

    while (0 <= currentRowNumber) {
      if (currentRowNumber in this.cellIndexToSize) return currentRowNumber;
      currentRowNumber--;
    }

    return false;
  }
}
