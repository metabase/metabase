import { t } from "ttag";

import { isNative } from "metabase/common/utils/card";
import { displayNameForColumn } from "metabase/utils/formatting";
import {
  trackTableFreezeColumnsEnabled,
  trackTableFreezeRowsEnabled,
} from "metabase/visualizations/analytics";
import ChartSettingLinkUrlInput from "metabase/visualizations/components/settings/ChartSettingLinkUrlInput";
import { ChartSettingNumberInput } from "metabase/visualizations/components/settings/ChartSettingNumberInput";
import {
  ChartSettingsTableFormatting,
  isFormattable,
} from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";
import * as DataGrid from "metabase/visualizations/lib/data_grid";
import {
  columnSettings,
  isPivoted,
  tableColumnSettings,
} from "metabase/visualizations/lib/settings/column";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import { getDefaultPivotColumn } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ColumnSettingDefinition,
  ComputedVisualizationSettings,
  VisualizationDefinition,
} from "metabase/visualizations/types";
import {
  isAvatarURL,
  isCoordinate,
  isDimension,
  isEmail,
  isImageURL,
  isMetric,
  isNumber,
  isString,
  isURL,
} from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

export const TABLE_DEFINITION = {
  getUiName: () => t`Table`,
  identifier: "table",
  iconName: "table2",
  canSavePng: false,

  minSize: getMinSize("table"),
  defaultSize: getDefaultSize("table"),

  isSensible: () => true,

  isLiveResizable: () => false,

  checkRenderable: () => {
    // table can always be rendered, nothing needed here
  },

  settings: {
    ...columnSettings({ getHidden: () => true }),
    "table.pagination": {
      getSection: () => t`Columns`,
      get title() {
        return t`Paginate results`;
      },
      inline: true,
      widget: "toggle",
      dashboard: true,
      getDefault: () => false,
    },
    "table.row_index": {
      getSection: () => t`Display`,
      get title() {
        return t`Show row index`;
      },
      inline: true,
      widget: "toggle",
      getDefault: () => false,
    },
    "table.freeze_columns": {
      getSection: () => t`Display`,
      get title() {
        return t`Freeze columns`;
      },
      inline: true,
      widget: "toggle",
      default: false,
      getHidden: (series: Series, settings: ComputedVisualizationSettings) =>
        isPivoted(series, settings),
      readDependencies: ["table.pivot"],
      onUpdate: (value: boolean) => {
        if (value) {
          trackTableFreezeColumnsEnabled();
        }
      },
    },
    "table.freeze_columns_count": {
      getSection: () => t`Display`,
      get title() {
        return t`Number of columns to freeze`;
      },
      widget: ChartSettingNumberInput,
      default: 1,
      isValid: (_series: Series, settings: VisualizationSettings) =>
        settings["table.freeze_columns_count"] >= 1,
      getHidden: (series: Series, settings: ComputedVisualizationSettings) =>
        !settings["table.freeze_columns"] || isPivoted(series, settings),
      readDependencies: ["table.freeze_columns", "table.pivot"],
      getProps: () => ({ min: 1 }),
    },
    "table.freeze_rows": {
      getSection: () => t`Display`,
      get title() {
        return t`Freeze rows`;
      },
      inline: true,
      widget: "toggle",
      default: false,
      getHidden: (series: Series, settings: ComputedVisualizationSettings) =>
        isPivoted(series, settings),
      readDependencies: ["table.pivot"],
      onUpdate: (value: boolean) => {
        if (value) {
          trackTableFreezeRowsEnabled();
        }
      },
    },
    "table.freeze_rows_count": {
      getSection: () => t`Display`,
      get title() {
        return t`Number of rows to freeze`;
      },
      widget: ChartSettingNumberInput,
      default: 1,
      isValid: (_series: Series, settings: VisualizationSettings) =>
        settings["table.freeze_rows_count"] >= 1,
      getHidden: (series: Series, settings: ComputedVisualizationSettings) =>
        !settings["table.freeze_rows"] || isPivoted(series, settings),
      readDependencies: ["table.freeze_rows", "table.pivot"],
      getProps: () => ({ min: 1 }),
    },
    "table.pivot": {
      getSection: () => t`Columns`,
      get title() {
        return t`Pivot table`;
      },
      widget: "toggle",
      inline: true,
      getHidden: (
        [{ data }]: Series,
        settings: ComputedVisualizationSettings,
      ) => data && data.cols.length !== 3 && !settings["table.pivot"],
      getDefault: ([{ card, data }]: Series) => {
        let native: boolean;
        try {
          native = isNative(card);
        } catch (error) {
          // isNative throws when used in the visualizer
          native = false;
        }
        if (
          !data ||
          data.cols.length !== 3 ||
          native ||
          data.cols.filter(isMetric).length !== 1 ||
          data.cols.filter(isDimension).length !== 2
        ) {
          return false;
        }

        return getDefaultPivotColumn(data.cols, data.rows) != null;
      },
    },

    "table.pivot_column": {
      getSection: () => t`Columns`,
      get title() {
        return t`Pivot column`;
      },
      widget: "field",
      getDefault: ([
        {
          data: { cols, rows },
        },
      ]: Series) => {
        return getDefaultPivotColumn(cols, rows)?.name;
      },
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        options: cols.filter(isDimension).map(getOptionFromColumn),
      }),
      getHidden: (series: Series, settings: VisualizationSettings) =>
        !settings["table.pivot"],
      readDependencies: ["table.pivot"],
      persistDefault: true,
    },
    "table.cell_column": {
      getSection: () => t`Columns`,
      get title() {
        return t`Cell column`;
      },
      widget: "field",
      getDefault: (
        [{ data }]: Series,
        { "table.pivot_column": pivotCol }: VisualizationSettings,
      ) => {
        // We try to show numeric values in pivot cells, but if none are
        // available, we fall back to the last column in the unpivoted table
        const nonPivotCols = data.cols.filter((c) => c.name !== pivotCol);
        const lastCol = nonPivotCols[nonPivotCols.length - 1];
        const { name } = nonPivotCols.find(isMetric) || lastCol || {};
        return name;
      },
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        options: cols.map(getOptionFromColumn),
      }),
      getHidden: (series: Series, settings: VisualizationSettings) =>
        !settings["table.pivot"],
      readDependencies: ["table.pivot", "table.pivot_column"],
      persistDefault: true,
    },
    ...tableColumnSettings({ isShowingDetailsOnlyColumns: false }),
    "table.column_widths": {},
    [DataGrid.COLUMN_FORMATTING_SETTING]: {
      getSection: () => t`Conditional Formatting`,
      widget: ChartSettingsTableFormatting,
      getDefault: () => [],
      getProps: (series: Series, settings: VisualizationSettings) => ({
        cols: series[0].data.cols.filter(isFormattable),
        isPivoted: settings["table.pivot"],
      }),

      getHidden: ([
        {
          data: { cols },
        },
      ]: Series) => cols.filter(isFormattable).length === 0,
      readDependencies: ["table.pivot"],
    },
    "table._cell_background_getter": {
      getValue(
        [
          {
            data: { rows, cols },
          },
        ]: Series,
        settings: VisualizationSettings,
      ) {
        return makeCellBackgroundGetter(
          rows,
          cols,
          settings[DataGrid.COLUMN_FORMATTING_SETTING] ?? [],
          settings["table.pivot"],
        );
      },
      readDependencies: [DataGrid.COLUMN_FORMATTING_SETTING, "table.pivot"],
    },
  },

  columnSettings: (column: DatasetColumn) => {
    const settings: Record<
      string,
      ColumnSettingDefinition<unknown, unknown>
    > = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column) => displayNameForColumn(column),
      },
      click_behavior: {},
      text_align: {
        title: t`Align`,
        widget: "select",
        getDefault: (column) => {
          const baseColumn = column?.remapped_to_column ?? column;
          return isNumber(baseColumn) || isCoordinate(baseColumn)
            ? "right"
            : "left";
        },
        getProps: () => ({
          options: [
            { name: t`Left`, value: "left" },
            { name: t`Right`, value: "right" },
            { name: t`Middle`, value: "middle" },
          ],
        }),
      },
    };

    if (isNumber(column)) {
      settings["show_mini_bar"] = {
        title: t`Show a mini bar chart`,
        widget: "toggle",
        inline: true,
      };
    }

    if (isString(column)) {
      const isNotImage = (columnSettings: ColumnSettings) =>
        columnSettings["view_as"] !== "image";

      settings["text_wrapping"] = {
        title: t`Wrap text`,
        getDefault: () => false,
        widget: "toggle",
        inline: true,
        isValid: (_column, columnSettings) => {
          return isNotImage(columnSettings);
        },
        getHidden: (_column, columnSettings) => {
          return !isNotImage(columnSettings);
        },
      };
    }

    let defaultValue = !column.semantic_type || isURL(column) ? "link" : null;

    const options = [
      { name: t`Text`, value: null },
      { name: t`Link`, value: "link" },
    ];

    if (!column.semantic_type || isEmail(column)) {
      defaultValue = "email_link";
      options.push({ name: t`Email link`, value: "email_link" });
    }
    if (!column.semantic_type || isImageURL(column) || isAvatarURL(column)) {
      defaultValue = isAvatarURL(column) ? "image" : "link";
      options.push({ name: t`Image`, value: "image" });
    }
    if (!column.semantic_type) {
      defaultValue = "auto";
      options.push({ name: t`Automatic`, value: "auto" });
    }

    if (options.length > 1) {
      settings["view_as"] = {
        title: t`Display as`,
        widget: options.length === 2 ? "radio" : "select",
        getDefault: () => defaultValue,
        getProps: () => ({
          options,
        }),
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      getDefault: () => null,
      getHidden: (_, settings) =>
        settings["view_as"] !== "link" && settings["view_as"] !== "email_link",
      readDependencies: ["view_as"],
      getProps: (
        column,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map((column) => column.name),
          placeholder: t`Link to {{bird_id}}`,
        };
      },
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      getDefault: () => null,
      getHidden: (_, settings) => settings["view_as"] !== "link",
      readDependencies: ["view_as"],
      getProps: (
        column,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map((column) => column.name),
          placeholder: t`http://toucan.example/{{bird_id}}`,
        };
      },
    };

    return settings;
  },
} satisfies VisualizationDefinition;
