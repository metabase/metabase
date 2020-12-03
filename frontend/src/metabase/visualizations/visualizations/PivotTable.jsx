import React, { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";
import { Grid, List, ScrollSync } from "react-virtualized";

import Ellipsified from "metabase/components/Ellipsified";
import { isDimension } from "metabase/lib/schema_metadata";
import { multiLevelPivot } from "metabase/lib/data_grid";
import { formatColumn, formatValue } from "metabase/lib/formatting";
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

export default class PivotTable extends Component {
  props: VisualizationProps;
  static uiName = t`Pivot Table`;
  static identifier = "pivot";
  static iconName = "pivot_table";

  static isSensible({ cols }) {
    return (
      cols.every(
        col => col.source === "aggregation" || col.source === "breakout",
      ) && cols.filter(col => col.source === "breakout").length < 5
    );
  }

  static checkRenderable([{ data }]) {
    if (
      !data.cols.every(
        col => col.source === "aggregation" || col.source === "breakout",
      )
    ) {
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
      getProps: ([{ data }], settings) => ({ partitions }),
      getValue: ([{ data }], settings = {}) => {
        const storedValue = settings["pivot_table.column_split"];
        let setting;
        if (storedValue == null) {
          const [dimensions, values] = _.partition(data.cols, isDimension);
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
          setting = { rows, columns, values };
        } else {
          setting = updateValueWithCurrentColumns(storedValue, data.cols);
        }
        return setting;
      },
    },
  };

  render() {
    const { settings, data, width, height } = this.props;
    const {
      rows: rowIndexes,
      columns: columnIndexes,
      values: valueIndexes,
    } = _.mapObject(settings["pivot_table.column_split"], columns =>
      columns
        .map(column =>
          data.cols.findIndex(col =>
            _.isEqual(col.field_ref, column.field_ref),
          ),
        )
        .filter(index => index !== -1),
    );

    let pivoted;
    try {
      pivoted = multiLevelPivot(data, columnIndexes, rowIndexes, valueIndexes);
    } catch (e) {
      console.warn(e);
    }
    const { topIndex, leftIndex, getRowSection } = pivoted;
    const cellWidth = 80;
    const cellHeight = 25;
    const topHeaderHeight = topIndex[0].length * cellHeight + 8; // the extravertical padding
    const leftHeaderWidth = leftIndex[0].length * cellWidth;

    function columnWidth({ index }) {
      const indexItem = topIndex[index];
      return indexItem[indexItem.length - 1].length * cellWidth;
    }

    function rowHeight({ index }) {
      const indexItem = leftIndex[index];
      return indexItem[indexItem.length - 1].length * cellHeight;
    }

    return (
      <div className="overflow-scroll">
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
                    <div
                      style={{ height: cellHeight, width: cellWidth }}
                      className="px1"
                    >
                      <Ellipsified>
                        {formatColumn(data.cols[index])}
                      </Ellipsified>
                    </div>
                  ))}
                </div>
                {/* top header */}
                <Grid
                  className="border-bottom border-medium scroll-hide-all text-medium"
                  width={width - leftHeaderWidth}
                  height={topHeaderHeight}
                  rowCount={1}
                  rowHeight={topHeaderHeight}
                  columnCount={topIndex.length}
                  columnWidth={columnWidth}
                  cellRenderer={({ key, style, columnIndex }) => {
                    const rows = topIndex[columnIndex];
                    return (
                      <div
                        key={key}
                        style={style}
                        className="flex-column px1 pt1"
                      >
                        {rows.map((row, index) => (
                          <div className="flex" style={{ height: cellHeight }}>
                            {row.map(({ value, span }) => (
                              <div
                                style={{ width: cellWidth * span }}
                                className={cx({
                                  "border-bottom": index < rows.length - 1,
                                })}
                              >
                                <Ellipsified>
                                  {formatValue(value, {
                                    column: data.cols[columnIndexes[index]],
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
                  width={leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="scroll-hide-all text-dark border-right border-medium"
                  rowCount={leftIndex.length}
                  rowHeight={rowHeight}
                  rowRenderer={({ key, style, index }) => (
                    <div key={key} style={style} className="flex">
                      {leftIndex[index].map((col, index) => (
                        <div className="flex flex-column">
                          {col.map(({ value, span = 1 }) => (
                            <div
                              style={{
                                height: cellHeight * span,
                                width: cellWidth,
                              }}
                              className="p1"
                            >
                              <Ellipsified>
                                {formatValue(value, {
                                  column: data.cols[rowIndexes[index]],
                                })}
                              </Ellipsified>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  scrollTop={scrollTop}
                  onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                />
                {/* pivot table body */}
                <Grid
                  width={width - leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="text-dark"
                  rowCount={leftIndex.length}
                  rowHeight={rowHeight}
                  columnCount={topIndex.length}
                  columnWidth={columnWidth}
                  cellRenderer={({ key, style, rowIndex, columnIndex }) => {
                    const rows = getRowSection(
                      topIndex[columnIndex][0][0].value,
                      leftIndex[rowIndex][0][0].value,
                    );
                    return (
                      <div key={key} style={style} className="flex flex-column">
                        {rows.map(row => (
                          <div className="flex">
                            {row.map(value => (
                              <div
                                style={{ width: cellWidth, height: cellHeight }}
                                className="p1"
                              >
                                {value}
                              </div>
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

function updateValueWithCurrentColumns(storedValue, columns) {
  const currentQueryFieldRefs = columns.map(c => JSON.stringify(c.field_ref));
  const currentSettingFieldRefs = Object.values(storedValue).flatMap(columns =>
    columns.map(c => JSON.stringify(c.field_ref)),
  );
  const toAdd = _.difference(currentQueryFieldRefs, currentSettingFieldRefs);
  const toRemove = _.difference(currentSettingFieldRefs, currentQueryFieldRefs);

  // remove toRemove
  const value = _.mapObject(storedValue, columns =>
    columns.filter(col => !toRemove.includes(JSON.stringify(col.field_ref))),
  );
  // add toAdd to first partitions where it matches the filter
  for (const fieldRef of toAdd) {
    for (const { filter, name } of partitions) {
      const column = columns.find(
        c => JSON.stringify(c.field_ref) === fieldRef,
      );
      if (filter == null || filter(column)) {
        value[name] = [...value[name], column];
        break;
      }
    }
  }
  return value;
}
