import type { DatasetData, Column, Row } from "metabase/meta/types/Dataset";

import range from 'lodash.range';
import flatMap from 'lodash.flatmap';
import type {SummaryTableSettings} from "metabase/meta/types/summary_table";
import type {DatasetQuery} from "metabase/meta/types/Card";
import {
  canTotalizeByType,
  getAllAggregationKeysFlatten,
  getQueryPlan
} from "metabase/visualizations/lib/settings/summary_table";

const buildStyleBuilder = ({rowSizeAndPositionManager, columnSizeAndPositionManager, horizontalOffsetAdjustment, verticalOffsetAdjustment}) =>
  ({rowStartIndex, rowStopIndex, columnStartIndex, columnStopIndex}) => {

  const rowDatums = range(rowStartIndex, rowStopIndex+1).map(p => rowSizeAndPositionManager.getSizeAndPositionOfCell(p));
  const columnDatums = range(columnStartIndex, columnStopIndex+ 1).map(p => columnSizeAndPositionManager.getSizeAndPositionOfCell(p));


  // if (deferredMeasurementCache && !deferredMeasurementCache.has(rowIndex, columnIndex)) {
  //   // Position not-yet-measured cells at top/left 0,0,
  //   // And give them width/height of 'auto' so they can grow larger than the parent Grid if necessary.
  //   // Positioning them further to the right/bottom influences their measured size.
  //   style = {
  //     height: 'auto',
  //     left: 0,
  //     position: 'absolute',
  //     top: 0,
  //     width: 'auto'
  //   };
  // } else {

  return {
    height: rowDatums.reduce((acc, {size}) => acc + size, 0),
    left: columnDatums[0].offset + horizontalOffsetAdjustment,
    position: 'absolute',
    top: rowDatums[0].offset + verticalOffsetAdjustment,
    width: columnDatums.reduce((acc, {size}) => acc + size, 0)
  };
};


const cacheWrapper = (cacheReadArray, cacheWriteArray, builder) => (args) =>{
  const {key} = args;
  const res = cacheReadArray[key] || builder(args);
  cacheWriteArray[key] = res;
  return res;
};


const getRealFirstIndex = (firstIndex, indexToLastIndex) => {
  let index = firstIndex;
  while (!Number.isInteger(indexToLastIndex(index))) {
    index--;
  }
  return index;
};

const createRowsIndexes = (rowStartIndex, indexToLastIndex , rowStopIndex) =>{
  const realFirstIndex = getRealFirstIndex(rowStartIndex, indexToLastIndex);
  const acc = Array();
  let currentIndex = realFirstIndex;
  while(currentIndex <= rowStopIndex)
  {
    const stopIndex = indexToLastIndex(currentIndex);
    acc.push({rowStartIndex: currentIndex, rowStopIndex: stopIndex});
    currentIndex = stopIndex + 1;
  }
  return acc;
};

const resizeCellInRow = ({rowStartIndex, rowStopIndex}, columnIndex, groupForRowGetter) =>{
  const getLastColumnIndexInGroup = groupForRowGetter[rowStartIndex];
  if(!getLastColumnIndexInGroup)
    return {rowStartIndex, rowStopIndex, columnStartIndex: columnIndex, columnStopIndex: columnIndex};

  const realFirstColumnIndex = getRealFirstIndex(columnIndex, getLastColumnIndexInGroup);
  const columnStopIndex = getLastColumnIndexInGroup(realFirstColumnIndex);

  return {rowStartIndex, rowStopIndex, columnStartIndex: realFirstColumnIndex, columnStopIndex};
};


export const buildIndexGenerator = ({groupsForColumns = [], groupsForRows = []} = {}) =>  {
  const emptyGetter = idx => idx;
  const groupForColumnGetter = groupsForColumns.map(p=> q => p[q]);
  const groupForRowGetter = groupsForRows.map(p=> q => p[q]);

  return ({windowRowStartIndex, windowRowStopIndex, windowColumnStartIndex, windowColumnStopIndex}) => flatMap(range(windowColumnStartIndex, windowColumnStopIndex +1),
    columnIndex =>
      createRowsIndexes(windowRowStartIndex, groupForColumnGetter[columnIndex] || emptyGetter, windowRowStopIndex)
        .filter(({rowStartIndex}) => {
          if(columnIndex === windowColumnStartIndex)
            return true;
          const getLastColumnIndexInGroup = groupForRowGetter[rowStartIndex];

          if(!getLastColumnIndexInGroup)
            return true;

          const endIndex = getLastColumnIndexInGroup(columnIndex);
          return endIndex || endIndex === 0;
        })
        .map(arg => resizeCellInRow(arg, columnIndex, groupForRowGetter)));
};

export const createKey = ({rowStartIndex, rowStopIndex, columnStartIndex, columnStopIndex}) =>
  `${rowStartIndex}-${rowStopIndex}-${columnStartIndex}-${columnStopIndex}`;

export const buildCellRangeRenderer = (indexGenerator) => (args) =>{
  const {columnSizeAndPositionManager, rowSizeAndPositionManager,
    horizontalOffsetAdjustment, verticalOffsetAdjustment, isScrolling,
    styleCache, cellCache,
    cellRenderer,
    columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex
  } = args;

  const areOffsetsAdjusted = columnSizeAndPositionManager.areOffsetsAdjusted() || rowSizeAndPositionManager.areOffsetsAdjusted();

  const canCacheStyle = !isScrolling && !areOffsetsAdjusted;
  const canCacheCell = isScrolling && !horizontalOffsetAdjustment && !verticalOffsetAdjustment;

  const styleBuilder = buildStyleBuilder(args);
  const cachedStyleBuilder = cacheWrapper(styleCache, canCacheStyle ? styleCache : Array(), styleBuilder);
  const cachedCellRenderer = cacheWrapper(cellCache, canCacheCell ? cellCache: Array(), cellRenderer);

  return indexGenerator({windowRowStartIndex: rowStartIndex, windowRowStopIndex: rowStopIndex, windowColumnStartIndex: columnStartIndex, windowColumnStopIndex: columnStopIndex})
    .map(args => ({...args, key: createKey(args)}))
    .map(args => ({...args, style:cachedStyleBuilder(args)}))
    .map(({key, style, columnStartIndex, rowStartIndex}) => ({key, style, columnIndex: columnStartIndex, rowIndex: rowStartIndex}))
    .map(cachedCellRenderer)
    .filter(p => p);
};


export function getTableCellClickedObjectForSummary(
  cols: Column[],
  column: Column,
  row : Row,
  value: any,
): ClickObject {
  if (row.isTotalColumnIndex !== undefined) {
    let dimensions = cols
      // $FlowFixMe: isTotalColumnIndex
      .filter((column, index) => index < row.isTotalColumnIndex)
      .map((column, index) => ({value: row[index], column}))
      .filter(dimension => dimension.column.source === "breakout")
    ;
    if(column.pivotedDimension)
      dimensions.push(column.pivotedDimension);
    return {
      dimensions,
    };
  } else if (column.source === "aggregation") {
    let dimensions = cols
      .map((column, index) => ({value: row[index], column}))
      .filter(dimension => dimension.column.source === "breakout")
    ;
    if(column.pivotedDimension)
    // $FlowFixMe: pivotedDimension
      dimensions.push(column.pivotedDimension);
    if(!value)
      value="";  // so that SortAction won't be available when dilling  
    return {
      value,
      column,
      dimensions,
    };
  } else {
    return { value, column };
  }
}

export const getAggregationQueries = (settings : SummaryTableSettings,  cols : Column[]): DatasetQuery[] => {

  const nameToTypeMap = getNameToTypeMap(cols);

  const createLiteral = name => ["field-literal", name, nameToTypeMap[name]];
  const createTotal = name => ["named", ["sum", createLiteral(name)], name];

  const queryPlan = getQueryPlan(settings, p =>
    canTotalizeByType(nameToTypeMap[p]));
  const allKeys = getAllAggregationKeysFlatten(queryPlan);

  return allKeys.map(([groupings, aggregations]) => ({
    aggregation: aggregations.toArray().map(createTotal),
    breakout: groupings.toArray().map(createLiteral),
  }));
};

const getNameToTypeMap = columns => {
  return columns.reduce(
    (acc, column) => ({ ...acc, [column.name]: column.base_type }),
    {},
  );
};
