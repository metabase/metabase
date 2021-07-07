/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn, updateIn } from "icepick";
import { Grid, Collection, ScrollSync, AutoSizer } from "react-virtualized";

import { color, lighten } from "metabase/lib/colors";
import "metabase/visualizations/components/TableInteractive.css";
import { getScrollBarSize } from "metabase/lib/dom";

import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { isDimension } from "metabase/lib/schema_metadata";
import {
  COLLAPSED_ROWS_SETTING,
  COLUMN_SPLIT_SETTING,
  COLUMN_SORT_ORDER,
  COLUMN_SHOW_TOTALS,
  isPivotGroupColumn,
  multiLevelPivot,
} from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";
import { findDOMNode } from "react-dom";

const PIVOT_BG_LIGHT = lighten(color("brand"), 0.65);
const PIVOT_BG_DARK = lighten(color("brand"), 0.6);

const partitions = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: jt`Fields to use for the table ${(
      <span className="text-dark text-heavy">{t`rows`}</span>
    )}`,
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: jt`Fields to use for the table ${(
      <span className="text-dark text-heavy">{t`columns`}</span>
    )}`,
  },
  {
    name: "values",
    columnFilter: col => !isDimension(col),
    title: jt`Fields to use for the table ${(
      <span className="text-dark text-heavy">{t`values`}</span>
    )}`,
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

  static databaseSupportsPivotTables(query) {
    if (query && query.database && query.database() != null) {
      // if we don't have metadata, we can't check this
      return query.database().supportsPivots();
    }
    return true;
  }

  static isSensible({ cols }, query) {
    return (
      cols.length >= 2 &&
      cols.every(isColumnValid) &&
      this.databaseSupportsPivotTables(query)
    );
  }

  static checkRenderable([{ data, card }], settings, query) {
    if (data.cols.length < 2 || !data.cols.every(isColumnValid)) {
      throw new Error(
        t`Pivot tables can only be used with aggregated queries.`,
      );
    }
    if (!this.databaseSupportsPivotTables(query)) {
      throw new Error(t`This database does not support pivot tables.`);
    }
  }

  static seriesAreCompatible(initialSeries, newSeries) {
    return false;
  }

  static settings = {
    ...columnSettings({ hidden: true }),
    [COLLAPSED_ROWS_SETTING]: {
      hidden: true,
      readDependencies: [COLUMN_SPLIT_SETTING],
      getValue: (series, settings = {}) => {
        // This is hack. Collapsed rows depend on the current column split setting.
        // If the query changes or the rows are reordered, we ignore the current collapsed row setting.
        // This is accomplished by snapshotting part of the column split setting *inside* this setting.
        // `value` the is the actual data for this setting
        // `rows` is value we check against the current setting to see if we should use `value`
        const { rows, value } = settings[COLLAPSED_ROWS_SETTING] || {};
        const { rows: currentRows } = settings[COLUMN_SPLIT_SETTING] || {};
        if (!_.isEqual(rows, currentRows)) {
          return { value: [], rows: currentRows };
        }
        return { rows, value };
      },
    },
    [COLUMN_SPLIT_SETTING]: {
      section: null,
      widget: "fieldsPartition",
      persistDefault: true,
      getHidden: ([{ data }]) =>
        // hide the setting widget if there are invalid columns
        !data || data.cols.some(col => !isColumnValid(col)),
      getProps: ([{ data }], settings) => ({
        partitions,
        columns: data == null ? [] : data.cols,
        settings,
      }),
      getValue: ([{ data, card }], settings = {}) => {
        const storedValue = settings[COLUMN_SPLIT_SETTING];
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

  static columnSettings = {
    column_title: {
      title: t`Column title`,
      widget: "input",
      getDefault: column => formatColumn(column),
    },
    [COLUMN_SHOW_TOTALS]: {
      hidden: true,
      getValue: (column, columnSettings, { settings }) => {
        const currentValue = columnSettings[COLUMN_SHOW_TOTALS];
        const rows = settings[COLUMN_SPLIT_SETTING].rows || [];
        // to show totals a column needs to be:
        //  - in the left header ("rows" in COLUMN_SPLIT_SETTING)
        //  - not the last column
        const canHaveSubtotal = rows
          .slice(0, rows.length - 1)
          .some(row => _.isEqual(row, column.field_ref));
        if (!canHaveSubtotal) {
          // when this is null, the setting widget hides the toggle
          return null;
        }
        return currentValue == null ? true : currentValue;
      },
    },
    [COLUMN_SORT_ORDER]: { hidden: true },
  };

  setBodyRef = element => {
    this.bodyRef = element;
  };

  getColumnTitle(columnIndex) {
    const { data, settings } = this.props;
    const columns = data.cols.filter(col => !isPivotGroupColumn(col));
    const { column, column_title: columnTitle } = settings.column(
      columns[columnIndex],
    );
    return columnTitle || formatColumn(column);
  }

  isColumnCollapsible(columnIndex) {
    const { data, settings } = this.props;
    const columns = data.cols.filter(col => !isPivotGroupColumn(col));
    const { [COLUMN_SHOW_TOTALS]: showTotals } = settings.column(
      columns[columnIndex],
    );
    return showTotals;
  }

  componentDidUpdate() {
    // This is needed in case the cell counts didn't change, but the data did
    this.leftHeaderRef && this.leftHeaderRef.recomputeCellSizesAndPositions();
    this.topHeaderRef && this.topHeaderRef.recomputeCellSizesAndPositions();
  }

  render() {
    const { settings, data, width, onUpdateVisualizationSettings } = this.props;
    if (data == null || !data.cols.some(isPivotGroupColumn)) {
      return null;
    }

    const grid = this.bodyRef && findDOMNode(this.bodyRef);

    // In cases where there are horizontal scrollbars are visible AND the data grid has to scroll vertically as well,
    // the left sidebar and the main grid can get out of ScrollSync due to slightly differing heights
    function scrollBarOffsetSize() {
      if (!grid) {
        return 0;
      }
      // get the size of the scrollbars
      const scrollBarSize = getScrollBarSize();
      const scrollsHorizontally = grid.scrollWidth > parseInt(grid.style.width);

      if (scrollsHorizontally && scrollBarSize > 0) {
        return scrollBarSize;
      } else {
        return 0;
      }
    }

    let pivoted;
    try {
      pivoted = multiLevelPivot(data, settings);
    } catch (e) {
      console.warn(e);
    }
    const {
      leftHeaderItems,
      topHeaderItems,
      rowCount,
      columnCount,
      rowIndex,
      getRowSection,
      rowIndexes,
      columnIndexes,
      valueIndexes,
    } = pivoted;

    const leftHeaderCellRenderer = ({ index, key, style }) => {
      const {
        value,
        isSubtotal,
        isGrandTotal,
        hasChildren,
        hasSubtotal,
        depth,
        path,
        clicked,
      } = leftHeaderItems[index];
      return (
        <div
          key={key}
          style={{ ...style, backgroundColor: PIVOT_BG_LIGHT }}
          className={cx("overflow-hidden", {
            "border-right border-medium": !hasChildren,
          })}
        >
          <Cell
            style={depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}}
            value={value}
            isSubtotal={isSubtotal}
            isGrandTotal={isGrandTotal}
            onClick={this.getCellClickHander(clicked)}
            icon={
              (isSubtotal || hasSubtotal) && (
                <RowToggleIcon
                  value={path}
                  settings={settings}
                  updateSettings={onUpdateVisualizationSettings}
                  hideUnlessCollapsed={isSubtotal}
                  rowIndex={rowIndex} // used to get a list of "other" paths when open one item in a collapsed column
                />
              )
            }
          />
        </div>
      );
    };
    const leftHeaderCellSizeAndPositionGetter = ({ index }) => {
      const { offset, span, depth, maxDepthBelow } = leftHeaderItems[index];
      return {
        height: span * CELL_HEIGHT,
        width:
          (rowIndexes.length - depth - maxDepthBelow) * LEFT_HEADER_CELL_WIDTH +
          (depth === 0 ? LEFT_HEADER_LEFT_SPACING : 0),
        x:
          depth * LEFT_HEADER_CELL_WIDTH +
          (depth > 0 ? LEFT_HEADER_LEFT_SPACING : 0),
        y: offset * CELL_HEIGHT,
      };
    };

    const topHeaderRows =
      columnIndexes.length + (valueIndexes.length > 1 ? 1 : 0) || 1;
    const topHeaderHeight = topHeaderRows * CELL_HEIGHT;

    const topHeaderCellRenderer = ({ index, key, style }) => {
      const { value, hasChildren, clicked } = topHeaderItems[index];
      return (
        <div
          key={key}
          style={style}
          className={cx("px1 flex align-center cursor-pointer", {
            "border-bottom border-medium": !hasChildren,
          })}
          onClick={this.getCellClickHander(clicked)}
        >
          <div
            className={cx("flex flex-full full-height align-center", {
              "border-bottom": hasChildren,
            })}
            style={{ width: "100%" }}
          >
            <Ellipsified>{value}</Ellipsified>
          </div>
        </div>
      );
    };
    const topHeaderCellSizeAndPositionGetter = ({ index }) => {
      const { offset, span, maxDepthBelow } = topHeaderItems[index];
      return {
        height: CELL_HEIGHT,
        width: span * CELL_WIDTH,
        x: offset * CELL_WIDTH,
        y: (topHeaderRows - maxDepthBelow - 1) * CELL_HEIGHT,
      };
    };

    const leftHeaderWidth =
      rowIndexes.length > 0
        ? LEFT_HEADER_LEFT_SPACING + rowIndexes.length * LEFT_HEADER_CELL_WIDTH
        : 0;

    // These are tied to the `multiLevelPivot` call, so they're awkwardly shoved in render for now

    const bodyRenderer = ({ key, style, rowIndex, columnIndex }) => (
      <div key={key} style={style} className="flex">
        {getRowSection(columnIndex, rowIndex).map(
          ({ value, isSubtotal, isGrandTotal, clicked }, index) => (
            <Cell
              key={index}
              value={value}
              isSubtotal={isSubtotal}
              isGrandTotal={isGrandTotal}
              isBody
              onClick={this.getCellClickHander(clicked)}
            />
          ),
        )}
      </div>
    );

    return (
      <div className="no-outline text-small full-height">
        <ScrollSync>
          {({ onScroll, scrollLeft, scrollTop }) => (
            <div className="full-height flex flex-column">
              <div className="flex" style={{ height: topHeaderHeight }}>
                {/* top left corner - displays left header columns */}
                <div
                  className={cx("flex align-end", {
                    "border-right border-bottom border-medium": leftHeaderWidth,
                  })}
                  style={{
                    backgroundColor: PIVOT_BG_LIGHT,
                    // add left spacing unless the header width is 0
                    paddingLeft: leftHeaderWidth && LEFT_HEADER_LEFT_SPACING,
                    width: leftHeaderWidth,
                    height: topHeaderHeight,
                  }}
                >
                  {rowIndexes.map((rowIndex, index) => (
                    <Cell
                      key={rowIndex}
                      value={this.getColumnTitle(rowIndex)}
                      style={{ width: LEFT_HEADER_CELL_WIDTH }}
                      icon={
                        // you can only collapse before the last column
                        index < rowIndexes.length - 1 &&
                        this.isColumnCollapsible(rowIndex) && (
                          <RowToggleIcon
                            value={index + 1}
                            settings={settings}
                            updateSettings={onUpdateVisualizationSettings}
                          />
                        )
                      }
                    />
                  ))}
                </div>
                {/* top header */}
                <Collection
                  ref={e => (this.topHeaderRef = e)}
                  className="scroll-hide-all text-medium"
                  width={width - leftHeaderWidth}
                  height={topHeaderHeight}
                  cellCount={topHeaderItems.length}
                  cellRenderer={topHeaderCellRenderer}
                  cellSizeAndPositionGetter={topHeaderCellSizeAndPositionGetter}
                  onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                  scrollLeft={scrollLeft}
                />
              </div>
              <div className="flex flex-full">
                {/* left header */}
                <div style={{ width: leftHeaderWidth }}>
                  <AutoSizer disableWidth>
                    {({ height }) => (
                      <Collection
                        ref={e => (this.leftHeaderRef = e)}
                        className="scroll-hide-all"
                        cellCount={leftHeaderItems.length}
                        cellRenderer={leftHeaderCellRenderer}
                        cellSizeAndPositionGetter={
                          leftHeaderCellSizeAndPositionGetter
                        }
                        width={leftHeaderWidth}
                        height={height - scrollBarOffsetSize()}
                        scrollTop={scrollTop}
                        onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                      />
                    )}
                  </AutoSizer>
                </div>
                {/* pivot table body */}
                <div>
                  <AutoSizer disableWidth>
                    {({ height }) => (
                      <Grid
                        width={width - leftHeaderWidth}
                        height={height}
                        className="text-dark"
                        rowCount={rowCount}
                        columnCount={columnCount}
                        rowHeight={CELL_HEIGHT}
                        columnWidth={valueIndexes.length * CELL_WIDTH}
                        cellRenderer={bodyRenderer}
                        onScroll={({ scrollLeft, scrollTop }) =>
                          onScroll({ scrollLeft, scrollTop })
                        }
                        ref={this.setBodyRef}
                        scrollTop={scrollTop}
                        scrollLeft={scrollLeft}
                      />
                    )}
                  </AutoSizer>
                </div>
              </div>
            </div>
          )}
        </ScrollSync>
      </div>
    );
  }

  getCellClickHander(clicked) {
    if (!clicked) {
      return null;
    }
    return e =>
      this.props.onVisualizationClick({
        ...clicked,
        event: e.nativeEvent,
        settings: this.props.settings,
      });
  }
}

function RowToggleIcon({
  value,
  settings,
  updateSettings,
  hideUnlessCollapsed,
  rowIndex,
}) {
  if (value == null) {
    return null;
  }
  const setting = settings[COLLAPSED_ROWS_SETTING];
  const ref = JSON.stringify(value);
  const isColumn = !Array.isArray(value);
  const columnRef = isColumn ? null : JSON.stringify(value.length);
  const settingValue = setting.value || [];
  const isColumnCollapsed = !isColumn && settingValue.includes(columnRef);
  const isCollapsed = settingValue.includes(ref) || isColumnCollapsed;
  if (hideUnlessCollapsed && !isCollapsed) {
    // subtotal rows shouldn't have an icon unless the section is collapsed
    return null;
  }

  // The giant nested ternary below picks the right function to toggle the current button.
  // That depends on whether we're a row or column header and whether we're open or closed.
  const toggle =
    isColumn && !isCollapsed // click on open column
      ? settingValue =>
          settingValue
            .filter(v => {
              const parsed = JSON.parse(v);
              return !(Array.isArray(parsed) && parsed.length === value);
            }) // remove any already collapsed items in this column
            .concat(ref) // add column to list
      : !isColumn && isColumnCollapsed // single row in collapsed column
      ? settingValue =>
          settingValue
            .filter(v => v !== columnRef) // remove column from list
            .concat(
              // add other rows in this columns so they stay closed
              rowIndex
                .filter(
                  item =>
                    // equal length means they're in the same column
                    item.length === value.length &&
                    // but not exactly this item
                    !_.isEqual(item, value),
                )
                // serialize those paths
                .map(item => JSON.stringify(item)),
            )
      : isCollapsed // closed row or column
      ? settingValue => settingValue.filter(v => v !== ref)
      : // open row or column
        settingValue => settingValue.concat(ref);

  return (
    <div
      className={cx(
        "flex align-center cursor-pointer text-brand-hover text-light",
      )}
      style={{
        padding: "4px",
        borderRadius: "4px",
        backgroundColor: isCollapsed ? PIVOT_BG_LIGHT : PIVOT_BG_DARK,
      }}
      onClick={e => {
        e.stopPropagation();
        updateSettings({
          [COLLAPSED_ROWS_SETTING]: updateIn(setting, ["value"], toggle),
        });
      }}
    >
      <Icon name={isCollapsed ? "add" : "dash"} size={8} />
    </div>
  );
}

function Cell({
  value,
  isSubtotal,
  isGrandTotal,
  onClick,
  style,
  isBody = false,
  className,
  icon,
}) {
  return (
    <div
      style={{
        lineHeight: `${CELL_HEIGHT}px`,
        ...(isGrandTotal ? { borderTop: "1px solid white" } : {}),
        ...style,
        ...(isSubtotal ? { backgroundColor: PIVOT_BG_DARK } : {}),
      }}
      className={cx(
        "shrink-below-content-size flex-full flex-basis-none TableInteractive-cellWrapper",
        className,
        {
          "text-bold": isSubtotal,
          "cursor-pointer": onClick,
        },
      )}
      onClick={onClick}
    >
      <div className={cx("px1 flex align-center", { "justify-end": isBody })}>
        <Ellipsified>{value}</Ellipsified>
        {icon && <div className="pl1">{icon}</div>}
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
  const breakouts = getIn(card, ["dataset_query", "query", "breakout"]) || [];
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
