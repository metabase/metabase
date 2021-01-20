import React, { Component } from "react";
import { t, jt } from "ttag";
import cx from "classnames";
import _ from "underscore";
import { getIn, updateIn } from "icepick";
import { Grid, Collection, ScrollSync } from "react-virtualized";

import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import { isDimension } from "metabase/lib/schema_metadata";
import { isPivotGroupColumn, multiLevelPivot } from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import type { VisualizationProps } from "metabase-types/types/Visualization";

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

const COLLAPSED_ROWS_SETTING = "pivot_table.collapsed_rows";
const COLUMN_SPLIT_SETTING = "pivot_table.column_split";

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

  render() {
    const {
      settings,
      data,
      width,
      height,
      onUpdateVisualizationSettings,
    } = this.props;
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
      pivoted = multiLevelPivot(
        data,
        columnIndexes,
        rowIndexes,
        valueIndexes,
        settings[COLLAPSED_ROWS_SETTING].value,
      );
    } catch (e) {
      console.warn(e);
    }
    const {
      leftHeaderItems,
      topHeaderItems,
      rowCount,
      columnCount,
      getRowSection,
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
      } = leftHeaderItems[index];
      return (
        <div
          key={key}
          style={style}
          className={cx("bg-light overflow-hidden", {
            "border-right border-medium": !hasChildren,
          })}
        >
          <Cell
            style={depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}}
            value={value}
            isSubtotal={isSubtotal}
            isGrandTotal={isGrandTotal}
            icon={
              (isSubtotal || hasSubtotal) && (
                <RowToggleIcon
                  value={path}
                  settings={settings}
                  updateSettings={onUpdateVisualizationSettings}
                  hideUnlessCollapsed={isSubtotal}
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
      const { value, hasChildren } = topHeaderItems[index];
      return (
        <div
          key={key}
          style={style}
          className={cx("px1 flex align-center", {
            "border-bottom border-medium": !hasChildren,
          })}
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
      </div>
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
                      style={{ width: LEFT_HEADER_CELL_WIDTH }}
                    />
                  ))}
                </div>
                {/* top header */}
                <Collection
                  className="scroll-hide-all text-medium"
                  width={width - leftHeaderWidth}
                  height={topHeaderHeight}
                  cellCount={topHeaderItems.length}
                  cellRenderer={topHeaderCellRenderer}
                  cellSizeAndPositionGetter={topHeaderCellSizeAndPositionGetter}
                  onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                  scrollLeft={scrollLeft}
                />
                {/* left header */}
                <Collection
                  className="scroll-hide-all"
                  cellCount={leftHeaderItems.length}
                  cellRenderer={leftHeaderCellRenderer}
                  cellSizeAndPositionGetter={
                    leftHeaderCellSizeAndPositionGetter
                  }
                  width={leftHeaderWidth}
                  height={height - topHeaderHeight}
                  scrollTop={scrollTop}
                  onScroll={({ scrollTop }) => onScroll({ scrollTop })}
                />
                {/* pivot table body */}
                <Grid
                  width={width - leftHeaderWidth}
                  height={height - topHeaderHeight}
                  className="text-dark"
                  rowCount={rowCount}
                  columnCount={columnCount}
                  rowHeight={CELL_HEIGHT}
                  columnWidth={valueIndexes.length * CELL_WIDTH}
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

function RowToggleIcon({
  value,
  settings,
  updateSettings,
  hideUnlessCollapsed,
}) {
  const setting = settings[COLLAPSED_ROWS_SETTING];
  const rowRef = JSON.stringify(value);
  const isCollapsed = (setting.value || []).includes(rowRef);
  if (hideUnlessCollapsed && !isCollapsed) {
    // subtotal rows shouldn't have an icon unless the section is collapsed
    return null;
  }
  const toggle = isCollapsed
    ? value => value.filter(v => v !== rowRef)
    : value => value.concat(rowRef);
  const update = () => {
    const updatedValue = updateIn(setting, ["value"], toggle);
    updateSettings({ [COLLAPSED_ROWS_SETTING]: updatedValue });
  };
  return (
    <div
      className={cx(
        "flex align-center cursor-pointer bg-brand-hover text-light text-white-hover",
        isCollapsed ? "bg-light" : "bg-medium",
      )}
      style={{ padding: "4px", borderRadius: "4px" }}
      onClick={update}
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
      }}
      className={cx("flex-full", className, {
        "bg-medium text-bold": isSubtotal,
        "cursor-pointer": onClick,
      })}
      onClick={onClick}
    >
      <div className={cx("px1 flex align-center", { "justify-end": isBody })}>
        {isBody ? (
          // Ellipsified isn't really needed for body cells. Avoiding it helps performance.
          value
        ) : (
          <Ellipsified>{value}</Ellipsified>
        )}
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
