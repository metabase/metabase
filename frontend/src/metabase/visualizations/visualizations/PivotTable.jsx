/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn, updateIn } from "icepick";
import { Grid, Collection, ScrollSync, AutoSizer } from "react-virtualized";

import { findDOMNode } from "react-dom";
import { connect } from "react-redux";
import { getScrollBarSize } from "metabase/lib/dom";
import ChartSettingsTableFormatting from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";

import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { isDimension } from "metabase/lib/schema_metadata";
import {
  COLLAPSED_ROWS_SETTING,
  COLUMN_SPLIT_SETTING,
  COLUMN_SORT_ORDER,
  COLUMN_SORT_ORDER_ASC,
  COLUMN_SORT_ORDER_DESC,
  COLUMN_SHOW_TOTALS,
  COLUMN_FORMATTING_SETTING,
  isPivotGroupColumn,
  multiLevelPivot,
} from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { ChartSettingIconRadio } from "metabase/visualizations/components/settings/ChartSettingIconRadio";

import { PLUGIN_SELECTORS } from "metabase/plugins";
import {
  PivotTableRoot,
  PivotTableCell,
  PivotTableTopLeftCellsContainer,
  RowToggleIconRoot,
  CELL_HEIGHT,
  PivotTableSettingLabel,
} from "./PivotTable.styled";

const partitions = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: (
      <PivotTableSettingLabel data-testId="pivot-table-setting">{t`Rows`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: (
      <PivotTableSettingLabel data-testId="pivot-table-setting">{t`Columns`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "values",
    columnFilter: col => !isDimension(col),
    title: (
      <PivotTableSettingLabel data-testId="pivot-table-setting">{t`Measures`}</PivotTableSettingLabel>
    ),
  },
];

// cell width and height for normal body cells
const CELL_WIDTH = 100;
// the left header has a wider cell width and some additional spacing on the left to align with the title
const LEFT_HEADER_LEFT_SPACING = 24;
const LEFT_HEADER_CELL_WIDTH = 145;

const mapStateToProps = state => ({
  hasCustomColors: PLUGIN_SELECTORS.getHasCustomColors(state),
});

class PivotTable extends Component {
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
      section: t`Columns`,
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
    [COLUMN_FORMATTING_SETTING]: {
      section: t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      default: [],
      getDefault: ([{ data }], settings) => {
        const columnFormats = settings[COLUMN_FORMATTING_SETTING] ?? [];

        return columnFormats
          .map(columnFormat => {
            const hasOnlyFormattableColumns = columnFormat.columns
              .map(columnName =>
                data.cols.find(column => column.name === columnName),
              )
              .filter(Boolean)
              .every(isFormattablePivotColumn);

            if (!hasOnlyFormattableColumns) {
              return null;
            }

            return {
              ...columnFormat,
              highlight_row: false,
            };
          })
          .filter(Boolean);
      },
      isValid: ([{ data }], settings) => {
        const columnFormats = settings[COLUMN_FORMATTING_SETTING] ?? [];

        return columnFormats.every(columnFormat => {
          const hasOnlyFormattableColumns = columnFormat.columns
            .map(columnName =>
              data.cols.find(column => column.name === columnName),
            )
            .filter(Boolean)
            .every(isFormattablePivotColumn);

          return hasOnlyFormattableColumns && !columnFormat.highlight_row;
        });
      },
      getProps: series => ({
        canHighlightRow: false,
        cols: series[0].data.cols.filter(isFormattablePivotColumn),
      }),
      getHidden: ([{ data }]) =>
        !data?.cols.some(col => isFormattablePivotColumn(col)),
    },
  };

  static columnSettings = {
    [COLUMN_SORT_ORDER]: {
      title: t`Sort Order`,
      widget: ChartSettingIconRadio,
      inline: true,
      props: {
        options: [
          {
            iconName: "arrow_up",
            value: COLUMN_SORT_ORDER_ASC,
          },
          {
            iconName: "arrow_down",
            value: COLUMN_SORT_ORDER_DESC,
          },
        ],
      },
      getHidden: ({ source }) => source === "aggregation",
    },
    [COLUMN_SHOW_TOTALS]: {
      title: t`Show totals`,
      widget: "toggle",
      inline: true,
      getDefault: (column, columnSettings, { settings }) => {
        //Default to showing totals if appropriate
        const rows = settings[COLUMN_SPLIT_SETTING].rows || [];
        return rows.slice(0, -1).some(row => _.isEqual(row, column.field_ref));
      },
      getHidden: (column, columnSettings, { settings }) => {
        const rows = settings[COLUMN_SPLIT_SETTING].rows || [];
        // to show totals a column needs to be:
        //  - in the left header ("rows" in COLUMN_SPLIT_SETTING)
        //  - not the last column
        return !rows.slice(0, -1).some(row => _.isEqual(row, column.field_ref));
      },
    },
    column_title: {
      title: t`Column title`,
      widget: "input",
      getDefault: column => formatColumn(column),
      variant: "form-field",
    },
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

  componentDidMount() {
    this.grid = this.bodyRef && findDOMNode(this.bodyRef);
  }

  render() {
    const {
      settings,
      data,
      width,
      hasCustomColors,
      onUpdateVisualizationSettings,
      isNightMode,
      isDashboard,
    } = this.props;
    if (data == null || !data.cols.some(isPivotGroupColumn)) {
      return null;
    }

    const grid = this.grid;

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
      const { value, isSubtotal, hasSubtotal, depth, path, clicked } =
        leftHeaderItems[index];

      return (
        <Cell
          key={key}
          style={{
            ...style,
            ...(depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}),
          }}
          isNightMode={isNightMode}
          value={value}
          isEmphasized={isSubtotal}
          isBold={isSubtotal}
          onClick={this.getCellClickHander(clicked)}
          icon={
            (isSubtotal || hasSubtotal) && (
              <RowToggleIcon
                value={path}
                settings={settings}
                updateSettings={onUpdateVisualizationSettings}
                hideUnlessCollapsed={isSubtotal}
                rowIndex={rowIndex} // used to get a list of "other" paths when open one item in a collapsed column
                isNightMode={isNightMode}
              />
            )
          }
        />
        // </div>
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
      const { value, hasChildren, clicked, isSubtotal, maxDepthBelow } =
        topHeaderItems[index];
      return (
        <Cell
          key={key}
          style={{
            ...style,
          }}
          value={value}
          isNightMode={isNightMode}
          isBorderedHeader={maxDepthBelow === 0}
          isEmphasized={hasChildren}
          isBold={isSubtotal}
          onClick={this.getCellClickHander(clicked)}
        />
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
          ({ value, isSubtotal, clicked, backgroundColor }, index) => (
            <Cell
              isNightMode={isNightMode}
              key={index}
              value={value}
              isEmphasized={isSubtotal}
              isBold={isSubtotal}
              isBody
              onClick={this.getCellClickHander(clicked)}
              backgroundColor={backgroundColor}
            />
          ),
        )}
      </div>
    );

    return (
      <PivotTableRoot isDashboard={isDashboard} isNightMode={isNightMode}>
        <ScrollSync>
          {({ onScroll, scrollLeft, scrollTop }) => (
            <div className="full-height flex flex-column">
              <div className="flex" style={{ height: topHeaderHeight }}>
                {/* top left corner - displays left header columns */}
                <PivotTableTopLeftCellsContainer
                  isNightMode={isNightMode}
                  style={{
                    width: leftHeaderWidth,
                  }}
                >
                  {rowIndexes.map((rowIndex, index) => (
                    <Cell
                      key={rowIndex}
                      isEmphasized
                      isBold
                      isBorderedHeader
                      isTransparent
                      hasTopBorder={topHeaderRows > 1}
                      isNightMode={isNightMode}
                      value={this.getColumnTitle(rowIndex)}
                      style={{
                        width: LEFT_HEADER_CELL_WIDTH,
                        ...(index === 0
                          ? { paddingLeft: LEFT_HEADER_LEFT_SPACING }
                          : {}),
                        ...(index === rowIndexes.length - 1
                          ? { borderRight: "none" }
                          : {}),
                      }}
                      icon={
                        // you can only collapse before the last column
                        index < rowIndexes.length - 1 &&
                        this.isColumnCollapsible(rowIndex) && (
                          <RowToggleIcon
                            value={index + 1}
                            settings={settings}
                            updateSettings={onUpdateVisualizationSettings}
                            hasCustomColors={hasCustomColors}
                            isNightMode={isNightMode}
                          />
                        )
                      }
                    />
                  ))}
                </PivotTableTopLeftCellsContainer>
                {/* top header */}
                <Collection
                  ref={e => (this.topHeaderRef = e)}
                  className="scroll-hide-all"
                  isNightMode={isNightMode}
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
      </PivotTableRoot>
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

export default connect(mapStateToProps)(PivotTable);

function RowToggleIcon({
  value,
  settings,
  updateSettings,
  hideUnlessCollapsed,
  rowIndex,
  hasCustomColors,
  isNightMode,
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
    <RowToggleIconRoot
      onClick={e => {
        e.stopPropagation();
        updateSettings({
          [COLLAPSED_ROWS_SETTING]: updateIn(setting, ["value"], toggle),
        });
      }}
    >
      <Icon name={isCollapsed ? "add" : "dash"} size={8} />
    </RowToggleIconRoot>
  );
}

function Cell({
  value,
  style,
  icon,
  backgroundColor,
  isBody = false,
  isBold,
  isEmphasized,
  isNightMode,
  isBorderedHeader,
  isTransparent,
  hasTopBorder,
  onClick,
}) {
  return (
    <PivotTableCell
      data-testid="pivot-table-cell"
      isNightMode={isNightMode}
      isBold={isBold}
      isEmphasized={isEmphasized}
      isBorderedHeader={isBorderedHeader}
      hasTopBorder={hasTopBorder}
      isTransparent={isTransparent}
      style={{
        ...style,
        ...(backgroundColor
          ? {
              backgroundColor,
            }
          : {}),
      }}
      onClick={onClick}
    >
      <div className={cx("px1 flex align-center", { "justify-end": isBody })}>
        <Ellipsified>{value}</Ellipsified>
        {icon && <div className="pl1">{icon}</div>}
      </div>
    </PivotTableCell>
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

function isFormattablePivotColumn(column) {
  return column.source === "aggregation";
}
