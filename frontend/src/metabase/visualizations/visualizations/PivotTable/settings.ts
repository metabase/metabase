import { getIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import {
  COLLAPSED_ROWS_SETTING,
  COLUMN_SPLIT_SETTING,
  COLUMN_SORT_ORDER,
  COLUMN_SORT_ORDER_ASC,
  COLUMN_SORT_ORDER_DESC,
  COLUMN_SHOW_TOTALS,
  COLUMN_FORMATTING_SETTING,
  isPivotGroupColumn,
} from "metabase/lib/data_grid";
import { formatColumn } from "metabase/lib/formatting";
import { ChartSettingIconRadio } from "metabase/visualizations/components/settings/ChartSettingIconRadio";
import { ChartSettingsTableFormatting } from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { isDimension } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  DatasetColumn,
  DatasetData,
  Series,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import { partitions } from "./partitions";
import type { PivotSetting } from "./types";
import {
  addMissingCardBreakouts,
  isColumnValid,
  isFormattablePivotColumn,
  updateValueWithCurrentColumns,
} from "./utils";

export const getTitleForColumn = (
  column: DatasetColumn,
  settings: VisualizationSettings,
) => {
  const { column: _column, column_title: columnTitle } =
    settings.column(column);
  return columnTitle || formatColumn(_column);
};

export const settings = {
  ...columnSettings({ hidden: true }),
  [COLLAPSED_ROWS_SETTING]: {
    hidden: true,
    readDependencies: [COLUMN_SPLIT_SETTING],
    getValue: (
      series: Series,
      settings: Partial<VisualizationSettings> = {},
    ) => {
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
    getHidden: ([{ data }]: [{ data: DatasetData }]) =>
      // hide the setting widget if there are invalid columns
      !data || data.cols.some(col => !isColumnValid(col)),
    getProps: (
      [{ data }]: [{ data: DatasetData }],
      settings: VisualizationSettings,
    ) => ({
      partitions,
      columns: data == null ? [] : data.cols,
      settings,
      getColumnTitle: (column: DatasetColumn) => {
        return getTitleForColumn(column, settings);
      },
    }),
    getValue: (
      [{ data, card }]: [{ data: DatasetData; card: Card }],
      settings: Partial<VisualizationSettings> = {},
    ) => {
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

        let rows;
        let columns: DatasetColumn[];

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

      return addMissingCardBreakouts(setting as PivotSetting, card);
    },
  },
  "pivot.show_row_totals": {
    section: t`Columns`,
    title: t`Show row totals`,
    widget: "toggle",
    default: true,
    inline: true,
  },
  "pivot.show_column_totals": {
    section: t`Columns`,
    title: t`Show column totals`,
    widget: "toggle",
    default: true,
    inline: true,
  },
  "pivot_table.column_widths": {},
  [COLUMN_FORMATTING_SETTING]: {
    section: t`Conditional Formatting`,
    widget: ChartSettingsTableFormatting,
    default: [],
    getDefault: (
      [{ data }]: [{ data: DatasetData }],
      settings: VisualizationSettings,
    ) => {
      const columnFormats = settings[COLUMN_FORMATTING_SETTING] ?? [];

      return columnFormats
        .map(columnFormat => {
          const hasOnlyFormattableColumns =
            columnFormat.columns
              .map((columnName: string) =>
                data.cols.find(column => column.name === columnName),
              )
              .filter(Boolean) ?? [].every(isFormattablePivotColumn);

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
    isValid: (
      [{ data }]: [{ data: DatasetData }],
      settings: VisualizationSettings,
    ): boolean => {
      const columnFormats = settings[COLUMN_FORMATTING_SETTING] ?? [];

      return columnFormats.every(columnFormat => {
        const hasOnlyFormattableColumns =
          columnFormat.columns
            .map(columnName =>
              (data.cols as DatasetColumn[]).find(
                column => column.name === columnName,
              ),
            )
            .filter(Boolean) ?? [].every(isFormattablePivotColumn);

        return hasOnlyFormattableColumns && !columnFormat.highlight_row;
      });
    },
    getProps: (series: Series) => {
      const cols = series[0].data?.cols ?? [];

      return {
        canHighlightRow: false,
        cols: cols.filter(isFormattablePivotColumn),
      };
    },
    getHidden: ([{ data }]: [{ data: DatasetData }]) =>
      !data?.cols.some(col => isFormattablePivotColumn(col)),
  },
};

export const _columnSettings = {
  [COLUMN_SORT_ORDER]: {
    title: t`Sort order`,
    widget: ChartSettingIconRadio,
    inline: true,
    borderBottom: true,
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
    getHidden: ({ source }: { source: DatasetColumn["source"] }) =>
      source === "aggregation",
  },
  [COLUMN_SHOW_TOTALS]: {
    title: t`Show totals`,
    widget: "toggle",
    inline: true,
    getDefault: (
      column: DatasetColumn,
      columnSettings: DatasetColumn,
      { settings }: { settings: VisualizationSettings },
    ) => {
      //Default to showing totals if appropriate
      const rows = settings[COLUMN_SPLIT_SETTING].rows || [];
      return rows
        .slice(0, -1)
        .some((row: RowValue) => _.isEqual(row, column.field_ref));
    },
    getHidden: (
      column: DatasetColumn,
      columnSettings: DatasetColumn,
      { settings }: { settings: VisualizationSettings },
    ) => {
      const rows = settings[COLUMN_SPLIT_SETTING].rows || [];
      // to show totals a column needs to be:
      //  - in the left header ("rows" in COLUMN_SPLIT_SETTING)
      //  - not the last column
      return !rows
        .slice(0, -1)
        .some((row: RowValue) => _.isEqual(row, column.field_ref));
    },
  },
  column_title: {
    title: t`Column title`,
    widget: "input",
    getDefault: formatColumn,
  },
};
