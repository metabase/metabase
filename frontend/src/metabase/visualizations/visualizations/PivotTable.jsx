import React, { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { Grid, List, ScrollSync } from "react-virtualized";
import { Flex } from "grid-styled";

import Ellipsified from "metabase/components/Ellipsified";
import { isDimension } from "metabase/lib/schema_metadata";
import { isPivotGroupColumn, multiLevelPivot } from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const partitions = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: t`Fields to use for the table rows`,
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: t`Fields to use for the table columns`,
  },
  {
    name: "values",
    columnFilter: col => !isDimension(col),
    title: t`Fields to use for the table values`,
  },
];

// cell width and height for normal body cells
const CELL_WIDTH = 100;
const CELL_HEIGHT = 25;
// the left header has a wider cell width and some additional spacing on the left to align with the title
const LEFT_HEADER_LEFT_SPACING = 24;
const LEFT_HEADER_CELL_WIDTH = 145;

export default class PivotTable extends Component {
  props: VisualizationProps;
  static uiName = t`Pivot Table`;
  static identifier = "pivot";
  static iconName = "pivot_table";

  static isLiveResizable(series) {
    return false;
  }

  static isSensible({ cols }) {
    return cols.length >= 2 && cols.every(isColumnValid);
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
      getValue: ([{ data, card }], settings = {}) => {
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

        return addMissingCardBreakouts(setting, card);
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
      topIndexFormatters,
      leftIndexFormatters,
      getRowSection,
      rowCount,
      columnCount,
    } = pivoted;
    const topHeaderHeight =
      topIndex.length === 0 ? CELL_HEIGHT : topIndex[0].length * CELL_HEIGHT;
    const leftHeaderWidth =
      leftIndex.length === 0
        ? 0
        : LEFT_HEADER_LEFT_SPACING +
          leftIndex[0][0].length * LEFT_HEADER_CELL_WIDTH;

    function columnWidth({ index }) {
      if (topIndex.length === 0) {
        return CELL_WIDTH;
      }
      const indexItem = topIndex[index];
      return indexItem[indexItem.length - 1].length * CELL_WIDTH;
    }

    function rowHeight({ index }) {
      if (leftIndex.length === 0) {
        return CELL_HEIGHT;
      }
      const span = leftIndex[index].reduce(
        (sum, row) => row[0][0].span + sum,
        0,
      );
      return span * CELL_HEIGHT;
    }

    // Create three memoized cell renderers
    // These are tied to the `multiLevelPivot` call, so they're awkwardly shoved in render for now

    const topHeaderRenderer = _.memoize(
      ({ key, style, columnIndex }) => {
        const rows = topIndex[columnIndex];
        return (
          <div key={key} style={style} className="border-bottom border-medium">
            <div className="flex flex-column px1 full-height justify-end">
              {rows.map((row, index) => (
                <Flex style={{ height: CELL_HEIGHT }}>
                  {row.map(({ value, span }) => (
                    <div
                      style={{ width: CELL_WIDTH * span }}
                      className={cx("flex flex-column justify-center", {
                        "border-bottom": index < rows.length - 1,
                      })}
                    >
                      <Ellipsified>
                        {index < topIndexFormatters.length
                          ? topIndexFormatters[index](value)
                          : value // Metric names don't have formatters
                        }
                      </Ellipsified>
                    </div>
                  ))}
                </Flex>
              ))}
            </div>
          </div>
        );
      },
      ({ columnIndex }) => columnIndex,
    );

    const leftHeaderRenderer = _.memoize(
      ({ key, style, index }) => {
        return (
          <div
            key={key}
            style={style}
            className="flex flex-column border-right border-medium"
          >
            {leftIndex[index].map((row, rowIndex) => (
              <div
                className="flex"
                style={{ height: row[0][0].span * CELL_HEIGHT }}
              >
                {row.map((col, index) =>
                  col[0].isSubtotal ? (
                    <Cell
                      value={col[0].value}
                      isSubtotal
                      isGrandTotal={col[0].isGrandTotal}
                      style={{
                        paddingLeft: LEFT_HEADER_LEFT_SPACING,
                        width: leftHeaderWidth,
                      }}
                    />
                  ) : (
                    <div
                      className="flex flex-column bg-light flex-basis-none flex-full"
                      style={{
                        paddingLeft: index === 0 ? LEFT_HEADER_LEFT_SPACING : 0,
                      }}
                    >
                      {col.map(({ value, span = 1, isSubtotal }) => (
                        <Cell
                          value={leftIndexFormatters[index](value)}
                          isSubtotal={isSubtotal}
                          height={span}
                          baseWidth={LEFT_HEADER_CELL_WIDTH}
                        />
                      ))}
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        );
      },
      ({ index }) => index,
    );

    const bodyRenderer = _.memoize(
      ({ key, style, rowIndex, columnIndex }) => {
        const rows = getRowSection(columnIndex, rowIndex);
        return (
          <Flex flexDirection="column" key={key} style={style}>
            {rows.map((row, rowIndex) => (
              <Flex key={rowIndex}>
                {row.map(
                  ({ value, isSubtotal, isGrandTotal, clicked }, index) => (
                    <Cell
                      key={index}
                      value={value}
                      height={1}
                      width={1}
                      isSubtotal={isSubtotal}
                      isGrandTotal={isGrandTotal}
                      isBody
                      onClick={
                        clicked &&
                        (() =>
                          this.props.onVisualizationClick({
                            ...clicked,
                            settings: this.props.settings,
                          }))
                      }
                    />
                  ),
                )}
              </Flex>
            ))}
          </Flex>
        );
      },
      ({ rowIndex, columnIndex }) => [rowIndex, columnIndex].join(),
    );

    return (
      <div className="no-outline text-small">
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
                <div
                  className={cx("flex align-end bg-light", {
                    "border-right border-bottom border-medium": leftHeaderWidth,
                  })}
                  style={{
                    // add left spacing unless the header width is 0
                    paddingLeft: leftHeaderWidth && LEFT_HEADER_LEFT_SPACING,
                    height: topHeaderHeight,
                  }}
                >
                  {rowIndexes.map(index => (
                    <Cell
                      value={formatColumn(columns[index])}
                      baseWidth={LEFT_HEADER_CELL_WIDTH}
                      width={1}
                      height={1}
                    />
                  ))}
                </div>
                {/* top header */}
                <Grid
                  ref={e => (this.topGrid = e)}
                  className="scroll-hide-all text-medium"
                  width={width - leftHeaderWidth}
                  height={topHeaderHeight}
                  rowCount={1}
                  rowHeight={topHeaderHeight}
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  cellRenderer={topHeaderRenderer}
                  onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                  scrollLeft={scrollLeft}
                />
                {/* left header */}
                <List
                  ref={e => (this.leftList = e)}
                  width={leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="scroll-hide-all text-dark"
                  rowCount={rowCount}
                  rowHeight={rowHeight}
                  rowRenderer={leftHeaderRenderer}
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
                  cellRenderer={bodyRenderer}
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

function Cell({
  value,
  isSubtotal,
  isGrandTotal,
  onClick,
  width,
  height,
  baseWidth = CELL_WIDTH,
  baseHeight = CELL_HEIGHT,
  style,
  isBody = false,
  className,
}) {
  return (
    <div
      style={{
        ...(width != null ? { width: baseWidth * width } : {}),
        ...(height != null ? { height: baseHeight * height } : {}),
        lineHeight: `${CELL_HEIGHT}px`,
        ...(isGrandTotal ? { borderTop: "1px solid white" } : {}),
        ...style,
      }}
      className={cx(className, {
        "bg-medium text-bold": isSubtotal,
        "cursor-pointer": onClick,
      })}
      onClick={onClick}
    >
      <div className="px1">
        {isBody ? (
          // Ellipsified isn't really needed for body cells. Avoiding it helps performance.
          value
        ) : (
          <Ellipsified>{value}</Ellipsified>
        )}
      </div>
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

// This is a hack. We need to pass pivot_rows and pivot_cols on each query.
// When a breakout is added to the query, we need to partition it before getting the rows.
// We pretend the breakouts are columns so we can partition the new breakout.
function addMissingCardBreakouts(setting, card) {
  const breakouts = getIn(card, ["dataset_query", "query", "breakout"]);
  if (breakouts.length <= setting.columns.length + setting.rows.length) {
    return setting;
  }
  const breakoutFieldRefs = breakouts.map(field_ref => ({ field_ref }));
  const { columns, rows } = updateValueWithCurrentColumns(
    setting,
    breakoutFieldRefs,
  );
  return { ...setting, columns, rows };
}

function isColumnValid(col) {
  return (
    col.source === "aggregation" ||
    col.source === "breakout" ||
    isPivotGroupColumn(col)
  );
}
