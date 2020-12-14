import React, { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { Grid, List, ScrollSync } from "react-virtualized";

import Ellipsified from "metabase/components/Ellipsified";
import { isDimension } from "metabase/lib/schema_metadata";
import { isPivotGroupColumn, multiLevelPivot } from "metabase/lib/data_grid";
import { formatColumn, formatValue } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const partitions = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: t`Row fields`,
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: t`Column fields`,
  },
  {
    name: "values",
    columnFilter: col => !isDimension(col),
    title: t`Value fields`,
  },
];

const CELL_WIDTH = 100;
const CELL_HEIGHT = 25;
export default class PivotTable extends Component {
  props: VisualizationProps;
  static uiName = t`Pivot Table`;
  static identifier = "pivot";
  static iconName = "pivot_table";

  static isSensible({ cols }) {
    return (
      cols.length >= 2 &&
      cols.every(isColumnValid) &&
      cols.filter(col => col.source === "breakout").length < 5
    );
  }

  static checkRenderable([{ data }]) {
    if (data.cols.length < 2 || !data.cols.every(isColumnValid)) {
      throw new Error(
        t`Pivot tables can only be used with aggregated queries.`,
      );
    }
  }

  static seriesAreCompatible(initialSeries, newSeries) {
    return false;
  }

  static settings = {
    ...columnSettings({ hidden: true }),
    "pivot_table.column_split": {
      section: null,
      widget: "fieldsPartition",
      persistDefault: true,
      getProps: ([{ data }], settings) => ({
        partitions,
        columns: data == null ? [] : data.cols,
      }),
      getValue: ([{ data }], settings = {}) => {
        const storedValue = settings["pivot_table.column_split"];
        if (data == null) {
          return undefined;
        }
        const columnsToPartition = data.cols.filter(
          col => !isPivotGroupColumn(col),
        );
        let setting;
        if (storedValue == null) {
          const [dimensions, values] = _.partition(
            columnsToPartition,
            isDimension,
          );
          const [first, second, ...rest] = _.sortBy(dimensions, col =>
            getIn(col, ["fingerprint", "global", "distinct-count"]),
          );
          let rows, columns;
          if (dimensions.length < 2) {
            columns = [];
            rows = [first];
          } else if (dimensions.length <= 3) {
            columns = [first];
            rows = [second, ...rest];
          } else {
            columns = [first, second];
            rows = rest;
          }
          setting = _.mapObject({ rows, columns, values }, cols =>
            cols.map(col => col.field_ref),
          );
        } else {
          setting = updateValueWithCurrentColumns(
            storedValue,
            columnsToPartition,
          );
        }
        return setting;
      },
    },
  };

  componentDidUpdate() {
    this.bodyGrid && this.bodyGrid.recomputeGridSize();
    this.leftList && this.leftList.recomputeGridSize();
    this.topGrid && this.topGrid.recomputeGridSize();
  }

  render() {
    const { settings, data, width, height } = this.props;
    if (data == null || !data.cols.some(isPivotGroupColumn)) {
      return null;
    }
    const setting = settings["pivot_table.column_split"];
    if (setting == null) {
      return null;
    }
    const columns = data.cols.filter(col => !isPivotGroupColumn(col));

    const {
      rows: rowIndexes,
      columns: columnIndexes,
      values: valueIndexes,
    } = _.mapObject(setting, columnFieldRefs =>
      columnFieldRefs
        .map(field_ref =>
          columns.findIndex(col => _.isEqual(col.field_ref, field_ref)),
        )
        .filter(index => index !== -1),
    );

    let pivoted;
    try {
      pivoted = multiLevelPivot(data, columnIndexes, rowIndexes, valueIndexes);
    } catch (e) {
      console.warn(e);
    }
    const {
      topIndex,
      leftIndex,
      getRowSection,
      rowCount,
      columnCount,
    } = pivoted;
    const topHeaderHeight =
      topIndex.length === 0
        ? CELL_HEIGHT
        : topIndex[0].length * CELL_HEIGHT + 8; // the extravertical padding
    const leftHeaderWidth =
      leftIndex.length === 0 ? 0 : leftIndex[0].length * CELL_WIDTH;

    function columnWidth({ index }) {
      if (topIndex.length === 0 || index === topIndex.length) {
        return CELL_WIDTH;
      }
      const indexItem = topIndex[index];
      return indexItem[indexItem.length - 1].length * CELL_WIDTH;
    }

    const showRowSubtotals = leftIndex[0].length > 1;
    function rowHeight({ index }) {
      if (leftIndex.length === 0 || index === leftIndex.length) {
        return CELL_HEIGHT;
      }
      const indexItem = leftIndex[index];
      return (
        (indexItem[indexItem.length - 1].length + (showRowSubtotals ? 1 : 0)) *
        CELL_HEIGHT
      );
    }

    return (
      <div className="overflow-scroll no-outline">
        <ScrollSync>
          {({ onScroll, scrollLeft, scrollTop }) => (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${leftHeaderWidth}px auto`,
                }}
              >
                {/* top left corner - displays left header columns */}
                <div className="flex align-end border-right border-bottom border-medium">
                  {rowIndexes.map(index => (
                    <Cell value={formatColumn(columns[index])} />
                  ))}
                </div>
                {/* top header */}
                <Grid
                  ref={e => (this.topGrid = e)}
                  className="border-bottom border-medium scroll-hide-all text-medium"
                  width={width - leftHeaderWidth}
                  height={topHeaderHeight}
                  rowCount={1}
                  rowHeight={topHeaderHeight}
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  cellRenderer={({ key, style, columnIndex }) => {
                    if (columnIndex === topIndex.length) {
                      return (
                        <div
                          key={key}
                          style={style}
                          className="flex-column justify-end px1 pt1"
                        >
                          <Cell
                            value={t`Row totals`}
                            width={valueIndexes.length}
                          />
                        </div>
                      );
                    }
                    const rows = topIndex[columnIndex];
                    return (
                      <div
                        key={key}
                        style={style}
                        className="flex-column px1 pt1"
                      >
                        {rows.map((row, index) => (
                          <div className="flex" style={{ height: CELL_HEIGHT }}>
                            {row.map(({ value, span }) => (
                              <div
                                style={{ width: CELL_WIDTH * span }}
                                className={cx({
                                  "border-bottom": index < rows.length - 1,
                                })}
                              >
                                <Ellipsified>
                                  {formatValue(value, {
                                    column: columns[columnIndexes[index]],
                                  })}
                                </Ellipsified>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                  onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                  scrollLeft={scrollLeft}
                />
                {/* left header */}
                <List
                  ref={e => (this.leftList = e)}
                  width={leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="scroll-hide-all text-dark border-right border-medium"
                  rowCount={rowCount}
                  rowHeight={rowHeight}
                  rowRenderer={({ key, style, index }) => {
                    if (index === leftIndex.length) {
                      return (
                        <div key={key} style={style} className="flex">
                          <div className="flex flex-column">
                            <Cell
                              value={t`Grand totals`}
                              isSubtotal
                              width={rowIndexes.length}
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={key} style={style} className="flex flex-column">
                        <div className="flex">
                          {leftIndex[index].map((col, index) => (
                            <div className="flex flex-column">
                              {col.map(({ value, span = 1 }) => (
                                <div
                                  style={{
                                    height: CELL_HEIGHT * span,
                                    width: CELL_WIDTH,
                                  }}
                                  className="px1"
                                >
                                  <Ellipsified>
                                    <div
                                      style={{
                                        height: CELL_HEIGHT,
                                        lineHeight: `${CELL_HEIGHT}px`,
                                        width: CELL_WIDTH,
                                      }}
                                    >
                                      {formatValue(value, {
                                        column: columns[rowIndexes[index]],
                                      })}
                                    </div>
                                  </Ellipsified>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        {showRowSubtotals && (
                          <Cell
                            value={t`Totals for ${formatValue(
                              leftIndex[index][0][0].value,
                              { column: columns[rowIndexes[0]] },
                            )}`}
                            isSubtotal
                            width={leftIndex[0].length}
                          />
                        )}
                      </div>
                    );
                  }}
                  scrollTop={scrollTop}
                  onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                />
                {/* pivot table body */}
                <Grid
                  ref={e => (this.bodyGrid = e)}
                  width={width - leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="text-dark"
                  rowCount={rowCount}
                  rowHeight={rowHeight}
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  cellRenderer={({ key, style, rowIndex, columnIndex }) => {
                    const rows = getRowSection(columnIndex, rowIndex);
                    return (
                      <div key={key} style={style} className="flex flex-column">
                        {rows.map(row => (
                          <div className="flex">
                            {row.map(({ value, isSubtotal }) => (
                              <Cell value={value} isSubtotal={isSubtotal} />
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                  onScroll={({ scrollLeft, scrollTop }) =>
                    onScroll({ scrollLeft, scrollTop })
                  }
                  scrollTop={scrollTop}
                  scrollLeft={scrollLeft}
                />
              </div>
            </div>
          )}
        </ScrollSync>
      </div>
    );
  }
}

function Cell({ value, isSubtotal, width = 1, height = 1 }) {
  return (
    <div
      style={{
        width: CELL_WIDTH * width,
        height: CELL_HEIGHT * height,
        lineHeight: `${CELL_HEIGHT * height}px`,
        borderTop: "1px solid white",
      }}
      className={cx({ "bg-medium text-bold": isSubtotal }, "px1")}
    >
      <Ellipsified>{value}</Ellipsified>
    </div>
  );
}

function updateValueWithCurrentColumns(storedValue, columns) {
  const currentQueryFieldRefs = columns.map(c => JSON.stringify(c.field_ref));
  const currentSettingFieldRefs = Object.values(storedValue).flatMap(
    fieldRefs => fieldRefs.map(field_ref => JSON.stringify(field_ref)),
  );
  const toAdd = _.difference(currentQueryFieldRefs, currentSettingFieldRefs);
  const toRemove = _.difference(currentSettingFieldRefs, currentQueryFieldRefs);

  // remove toRemove
  const value = _.mapObject(storedValue, fieldRefs =>
    fieldRefs.filter(
      field_ref => !toRemove.includes(JSON.stringify(field_ref)),
    ),
  );
  // add toAdd to first partitions where it matches the filter
  for (const fieldRef of toAdd) {
    for (const { columnFilter: filter, name } of partitions) {
      const column = columns.find(
        c => JSON.stringify(c.field_ref) === fieldRef,
      );
      if (filter == null || filter(column)) {
        value[name] = [...value[name], column.field_ref];
        break;
      }
    }
  }
  return value;
}

function isColumnValid(col) {
  return (
    col.source === "aggregation" ||
    col.source === "breakout" ||
    isPivotGroupColumn(col)
  );
}
