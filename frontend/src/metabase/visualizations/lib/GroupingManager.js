import { Row } from "metabase/meta/types/Dataset";
import _ from "lodash";
import flatMap from "lodash.flatmap";
import unset from "lodash.unset";
import orderBy from "lodash.orderby";
import set from "lodash.set";
import range from "lodash.range";
import type {
  AggregationKey,
  QueryPlan,
  ResultProvider,
  SummaryTableSettings,
} from "metabase/meta/types/summary_table";
import {
  getAllQueryKeys,
  getColumnsFromSettings, getMainKey, getQueryPlan
} from "metabase/visualizations/lib/settings/summary_table";
import type { ColumnName, Column } from "metabase/meta/types/Dataset";

type ColumnAcc = {
  prevRow: Row,
  firstInGroupIndexes: Set,
};

//todo: change class to function prepareSummaryData
export class GroupingManager {
  columnIndexToFirstInGroupIndexes: [];
  totalsRows: [];
  rows: Row[];
  cols;
  probeRows: Row[];
  probeCols;
  valueColsLen = 1;
  columnsHeaders: any[][] = [];

  constructor(
    summaryTableSettings: SummaryTableSettings,
    rawCols,
    rp: ResultProvider,
  ) {

    const qp = getQueryPlan(summaryTableSettings, canTotalizeBuilder(rawCols));

    const isPivoted = summaryTableSettings.columnsSource.length > 0;
    const columnsIndexesForGrouping = [
      ...new Array(
        (summaryTableSettings.groupsSources || []).length + (isPivoted ? 1 : 0),
      ).keys(),
    ];
    const getAscDesc = colName =>
      (summaryTableSettings.columnNameToMetadata[colName] || {}).isAscSortOrder;
    const sortOrderMethod = columnsIndexesForGrouping.map(funGen);
    const mainSsortOrderMethod = columnsIndexesForGrouping.map(getValueByIndex);
    const ascDesc = (summaryTableSettings.groupsSources || [])
      .map(getAscDesc)
      .map(isAsc => (isAsc ? "asc" : "desc"));

    const normalizedRows = getAllQueryKeys(qp)
      .map(keys => [
        flatMap(keys, key => normalizeRows(summaryTableSettings, rp(key))),
        keys,
      ])
      .map(
        (res, index) =>
          index === 0
            ? [sortMainGroup(res[0], mainSsortOrderMethod, ascDesc), res[1]]
            : res,
      )
      .map(
        res => (isPivoted ? [pivotRows(res[0], sortOrderMethod), res[1]] : res),
      )
      .map(([rows, keys], index) =>
        index === 0 ? rows
          :tryAddColumnTotalIndex(
          rows,
          keys,
          summaryTableSettings.columnsSource[0],
        ),
      );
    const tmp = getAvailableColumnIndexes(summaryTableSettings, rawCols);
    let cols = tmp
      .map(p => rawCols[p[0]])
      .map((col, i) => ({ ...col, getValue: getValueByIndex(i) }));
    this.probeCols = cols;
    const rows = [].concat(...normalizedRows);
    //
    this.rows = _.sortBy(rows, sortOrderMethod);
    const foo = getFirstInGroupMap(this.rows);
    const res = columnsIndexesForGrouping
      .map(foo)
      .map(p => p.firstInGroupIndexes);
    const res2 = res.reduce(
      ({ resArr, prevElem }, elem) => {
        const r = new Set([...prevElem, ...elem]);
        resArr.push(r);
        return { resArr, prevElem: r };
      },
      { resArr: [], prevElem: new Set() },
    ).resArr;
    const res3 = res2.map((v, i) => [columnsIndexesForGrouping[i], v]);
    if (isPivoted) {
      const mainRes = rp(getMainKey(qp));
      const pivotIndex = mainRes.columns.indexOf(summaryTableSettings.columnsSource[0]);
      const columns = mainRes.rows.reduce((acc, elem) => acc.add(elem[pivotIndex]), new Set());


      const hasUndef = summaryTableSettings.columnNameToMetadata[summaryTableSettings.columnsSource[0]].showTotals;

      let pivotedColumns = orderBy(
        [...columns],
        p => p,
        getAscDesc(summaryTableSettings.columnsSource[0]) ? "asc" : "desc",
      );

      if (hasUndef) pivotedColumns= [...pivotedColumns, undefined];

      const tmp = getAvailableColumnIndexes(summaryTableSettings, rawCols);
      const colsTmp = tmp
        .map(p => rawCols[p[0]])
        .map((col, i) => ({ ...col, getValue: getValueByIndex(i) }));

      this.columnIndexToFirstInGroupIndexes = res3.reduce(
        (acc, [columnIndex, value]) => {
          acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value);
          return acc;
        },
        [],
      );
      const grColumnsLength = (summaryTableSettings.groupsSources || []).length;
      const grCols = colsTmp.slice(0, grColumnsLength).map((col, i) => ({
        ...col,
        getValue: getValueByIndex(i),
        parentName: ["", 1],
      }));


      const pivotColumn = colsTmp[grColumnsLength];
      const values = colsTmp.slice(grColumnsLength + 1);
      const tt = pivotedColumns.map(k => [getPivotValue(k, grColumnsLength+1), k]).map(([getValue, k]) => values.map((col, i) => ({...col, getValue: getValue(i), parentName: i === 0 ? [k ? k : 'Grand totals' , values.length, k ? colsTmp[grColumnsLength] : undefined ] : undefined, pivotedDimension: k ? {value: k, column: rawCols.find(c => c.name===summaryTableSettings.columnsSource[0])} : undefined})).filter(col => k !== undefined || canTotalize(col.base_type)));
      this.probeCols = grCols.concat(tt[0]);
      this.valueColsLen = (tt[0] || []).length;
      cols = grCols.concat(...tt);

      const grHeaders = grCols.map((column, i) => ({
        columnIndex: i,
        column,
        columnSpan: 1,
      }));


      let pivotedHeaders = buildHeader(
        [{ column: pivotColumn, values: pivotedColumns }],
        values,
      );

      if (pivotedHeaders[pivotedHeaders.length-2][0].columnSpan === 1)
        pivotedHeaders = pivotedHeaders.slice(0, pivotedHeaders.length - 1);

      this.columnsHeaders = pivotedHeaders.map((row, index) => [
        ...(index === pivotedHeaders.length - 1
          ? grHeaders
          : Array(grHeaders.length)),
        ...row,
      ]);

      unset(
        this.columnIndexToFirstInGroupIndexes,
        columnsIndexesForGrouping.length - 1,
      );
    } else {
      this.columnIndexToFirstInGroupIndexes = res3.reduce(
        (acc, [columnIndex, value]) => {
          acc[columnIndex] = getStartGroupIndexToEndGroupIndex(value);
          return acc;
        },
        [],
      );
      this.columnsHeaders = [
        cols.map((column, i) => ({ columnIndex: i, column, columnSpan: 1 })),
      ];
    }


    this.probeRows = [
      this.rows[this.rows.length - 1],
      ...this.rows.slice(0, 10),
      ...cols.map(p => this.rows.find((row, index) => index > 10 && p.getValue(row))).filter(p => p),
    ].map(p => p.isTotalColumnIndex ? ({__proto__:p, colSpan: (summaryTableSettings.groupsSources || []).length - Math.max(p.isTotalColumnIndex-1, 0) }): p);
    this.cols = cols;

    const lastGroupIndex = (summaryTableSettings.groupsSources || []).length -1;
    const valuesRow = range(lastGroupIndex+1, this.cols.length).reduce((acc, val) => set(acc, val,val), {});

    this.totalsRows = this.rows.reduce((acc, row, index) => Number.isInteger(row.isTotalColumnIndex) ?
      set(acc, index, {[Math.max(row.isTotalColumnIndex-1, 0)]:lastGroupIndex,  __proto__: valuesRow}) : acc,[]);
  }

  isVisible = (
    rowIndex: Number,
    columnIndex: Number,
    visibleRowIndices: Range,
  ): Boolean => {
    if (rowIndex < visibleRowIndices.start || visibleRowIndices.stop < rowIndex)
      return false;

    if (!this.isGrouped(columnIndex)) return true;

    if (rowIndex === visibleRowIndices.start) return true;

    return rowIndex in this.columnIndexToFirstInGroupIndexes[columnIndex];
  };

  isGrouped = (columnIndex: Number) =>
    columnIndex in this.columnIndexToFirstInGroupIndexes;

  mapStyle = (
    rowIndex: Number,
    columnIndex: Number,
    cellStyle: {},
  ): {} => {
    let res = cellStyle;
    if (columnIndex in this.columnIndexToFirstInGroupIndexes) {
      if ("height" in cellStyle) {
        res = {
          ...cellStyle,
          display: "block",
          "padding-top": ".25em",
        };
      }
      res = { ...res, background: "#F8F9FA" };
    }

    return res;
  };

  getRowSpan = (
    rowIndex: Number,
    columnIndex: Number,
    visibleRowIndices: Range,
  ): Number => {
    if (columnIndex in this.columnIndexToFirstInGroupIndexes) {
      const tmp = this.columnIndexToFirstInGroupIndexes[columnIndex];
      const ri = getFirstRowInGroupIndex(tmp, rowIndex);
      const endIndex = tmp[ri];
      const visibleStartIndex = Math.max(rowIndex, ri);
      const visibleEndIndex = Math.min(endIndex, visibleRowIndices.stop);
      const rowSpan = visibleEndIndex - visibleStartIndex + 1;
      return rowSpan;
    }
    return 1;
  };

  createKey = (rowIndex: Number, columnIndex: Number) => {
    const firstIndexesInGroup = this.columnIndexToFirstInGroupIndexes[
      columnIndex
    ];
    if (!firstIndexesInGroup) return rowIndex + "-" + columnIndex;

    const ri = getFirstRowInGroupIndex(firstIndexesInGroup, rowIndex);

    return ri + "-" + columnIndex;
  };
}

const canTotalizeBuilder = (cols: Column[]): (ColumnName => boolean) => {
  const columnNameToType = cols.reduce(
    (acc, { name, base_type }) => ({ ...acc, [name]: base_type }),
    {},
  );
  return p => canTotalize(columnNameToType[p]);
};

const sortMainGroup = (
  rows: Row[],
  sortOrderMethod: methods[],
  ascDesc: string[],
) => _.orderBy(rows, sortOrderMethod, ascDesc);

const getValueByIndex = (index: Number) => row => row[index];
const getPivotValue = (key, offset) => (index: Number) => row =>
  (row.piv[key] || [])[index + offset];

//todo change name, add comment
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

const hasTheSameValueByColumn = (columnIndex: Number) => (
  row1: Row,
  row2: Row,
): Boolean => row1[columnIndex] === row2[columnIndex];
const getRow = (rows: Row[]) => (rowIndex: Number): Row => rows[rowIndex] || [];

const isFirstInGroup = (columns: Number[], rows: Row[]) => (
  rowIndex: Number,
): Boolean => {
  const prevRow = getRow(rows)(rowIndex - 1);
  const currentRow = getRow(rows)(rowIndex);
  return columns.reduce(
    false,
    (acc, columnIndex) =>
      acc || !hasTheSameValueByColumn(columnIndex)(prevRow, currentRow),
  );
};

const updateFirstInGroup = (hasTheSameValue, columnIndex) => (
  { prevRow, firstInGroupIndexes }: ColumnAcc,
  currentRow,
  index: Number,
) => {
  if (
    !hasTheSameValue(prevRow, currentRow) ||
    currentRow.isTotalColumnIndex === columnIndex + 1
  )
    firstInGroupIndexes.add(index);

  return { prevRow: currentRow, firstInGroupIndexes };
};

const getFirstRowInGroupIndex = (firstInGroup, rowIndex: Number): Number => {
  while (!(rowIndex in firstInGroup)) rowIndex--;

  return rowIndex;
};

const getStartGroupIndexToEndGroupIndex = (startIndexes: Set): {} => {
  const sortedIndexes = _.sortBy(Array.from(startIndexes));
  const [x, ...tail] = sortedIndexes;
  return tail.reduce((acc, currentValue, index) => {
    acc[sortedIndexes[index]] = currentValue - 1;
    return acc;
  }, {});
};

const createUberRows = (pivotIndex, values) => {

  const piv = values.reduce(
    (acc, value) => ({
      ...acc,
      [value[pivotIndex]]: [...(acc[value[pivotIndex]] || []), value],
    }),
    {},
  );

  const properties = Object.getOwnPropertyNames(piv);
  const resPart = _.zip(...properties.map(propName => piv[propName]));
  const aa = resPart.map(arr =>
    properties.reduce(
      (acc, propName, i) => ({ ...acc, [propName]: arr[i] }),
      {},
    ),
  );
  return aa.map(piv => ({ piv, __proto__: values[0] }));
};

////////////////////////////////////

const getFirstInGroupMap = (rows: Row) => (columnIndex: Number) => {
  return rows.reduce(
    updateFirstInGroup(hasTheSameValueByColumn(columnIndex), columnIndex),
    {
      prevRow: [],
      firstInGroupIndexes: new Set().add(0).add(rows.length),
    },
  );
};

const getAvailableColumnIndexes = (settings, cols) =>
  getColumnsFromSettings(settings)
    .map(f => [_.findIndex(cols, c => c.name === f), f])
    .filter(i => i[0] < cols.length);

const normalizeRows = (settings, { cols, rows }) => {
  const columnIndexes = getAvailableColumnIndexes(settings, cols).map(
    p => p[0],
  );

  return rows.map(row => columnIndexes.map(i => row[i]));
};

const tryAddColumnTotalIndex = (
  rows: Row[],
  keys: AggregationKey[],
  columnSource: string,
): Row[] => {
  const groupings = keys[0][0];
  const pivotCorrection = groupings.has(columnSource) ? 1 : 0;

  const isTotalColumnIndex = groupings.size - pivotCorrection;
  return rows.map(row => ({ __proto__: row, isTotalColumnIndex }));
};

const pivotRows = (rows, cmp) => {
  const rowsOrdered = _.sortBy(rows, cmp);

  const foo = getFirstInGroupMap(rowsOrdered);
  const res = [...cmp.keys()].map(foo).map(p => p.firstInGroupIndexes);
  const res2 = res.reduce(
    ({ resArr, prevElem }, elem) => {
      const r = new Set([...prevElem, ...elem]);
      resArr.push(r);
      return { resArr, prevElem: r };
    },
    { resArr: [], prevElem: new Set() },
  ).resArr;

  const pivotColumnNumber = cmp.length - 1;
  const dd = _.sortBy(Array.from(res2[res2.length - 2] || []));
  const [x, ...tail] = dd;
  const ttttttttttt = tail.reduce((acc, currentValue, index) => {
    acc[dd[index]] = currentValue - 1;
    return acc;
  }, {});
  const functionf = v => createUberRows(pivotColumnNumber, v);

  const grouped = [].concat(
    ...Object.getOwnPropertyNames(ttttttttttt)
      .map(start => rowsOrdered.slice(start, ttttttttttt[start] + 1))
      .map(functionf),
  );
  return grouped;
};

//todo remove, use from SummaryTableQueryBuilder
export const canTotalize = (type: string) =>
  type === "type/Integer" || type === "type/Float" || type === "type/Decimal";

type ColumnHeader = {
  column: Column,
  columnSpan: Number,
  value?: any,
};

const unfoldRow = (rows: ColumnHeader[]) =>
  rows.reduce(
    ({ acc, currentIndex }, elem) => ({
      acc: set(acc, currentIndex, elem),
      currentIndex: currentIndex + elem.columnSpan,
    }),
    { acc: Array(rows.length * rows[0].columnSpan), currentIndex: 0 },
  ).acc;

const repeat = (values: [], len) => flatMap(Array(len), () => values);

const buildHeader = (
  pivotedColumns: { column: Column, values: any[] }[],
  valuesColumns: Column[],
): ColumnHeader[][] => {
  const bottomRowFolded = valuesColumns.map(column => ({
    column,
    columnSpan: 1,
  }));
  const { foldedRows } = pivotedColumns.reduceRight(
    ({ foldedRows, columnSpan }, { column, values }) => {
      const currentFoldedRow = values.map(value => ({
        value,
        column,
        columnSpan,
      }));
      return {
        foldedRows: [currentFoldedRow, ...foldedRows],
        columnSpan: columnSpan * values.length,
      };
    },
    { foldedRows: [bottomRowFolded], columnSpan: bottomRowFolded.length },
  );

  const secondRow = foldedRows[foldedRows.length-2];
  const grandTotalColumnCandidate = secondRow[secondRow.length -1];
  if(!grandTotalColumnCandidate.value)
    grandTotalColumnCandidate.displayText = 'Grand totals';

  const unfoldedRows = foldedRows.map(unfoldRow);
  const expectedRowLength = unfoldedRows[0].length;
  return unfoldedRows.map(row => repeat(row, expectedRowLength / row.length));
};
