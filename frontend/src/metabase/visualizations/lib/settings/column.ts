import { t } from "ttag";
import _ from "underscore";

import type { RawSeries, DatasetColumn } from "metabase-types/api";
import type { VisualizationSettings } from "metabase-types/api";

import { currency } from "cljs/metabase.util.currency";
import {
  displayNameForColumn,
  getCurrency,
  getCurrencyNarrowSymbol,
  getCurrencyStyleOptions,
  getCurrencySymbol,
  getDateFormatFromStyle,
  getDateStyleOptionsForUnit,
  getTimeStyleOptions,
  numberFormatterForOptions,
} from "metabase/lib/formatting";
import { hasHour } from "metabase/lib/formatting/datetime-utils";
import MetabaseSettings from "metabase/lib/settings";
import { getVisualizationRaw } from "metabase/visualizations";
import { ChartNestedSettingColumns } from "metabase/visualizations/components/settings/ChartNestedSettingColumns";
import { ChartSettingTableColumns } from "metabase/visualizations/components/settings/ChartSettingTableColumns";
import { getDeduplicatedTableColumnSettings } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultCurrency,
  getDefaultCurrencyInHeader,
  getDefaultCurrencyStyle,
  getDefaultNumberSeparators,
  getDefaultNumberStyle,
} from "metabase/visualizations/shared/settings/column";
import {
  getColumnKey,
  getObjectColumnSettings,
} from "metabase-lib/v1/queries/utils/column-key";
import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import {
  isCoordinate,
  isCurrency,
  isDate,
  isDateWithoutTime,
  isNumber,
} from "metabase-lib/v1/types/utils/isa";

import { nestedSettings } from "./nested";

type GetColumnsFn = (
  series: RawSeries,
  vizSettings: VisualizationSettings,
) => DatasetColumn[];

const DEFAULT_GET_COLUMNS: GetColumnsFn = (series) =>
  series.flatMap((s) => s.data?.cols ?? []);

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  hidden,
  ...def
}: {
  getColumns?: GetColumnsFn;
  hidden?: boolean;
  section?: string;
  readDependencies?: string[];
  [key: string]: unknown;
} = {}) {
  return nestedSettings("column_settings", {
    section: t`Formatting`,
    objectName: "column",
    getObjects: getColumns,
    getObjectKey: getColumnKey,
    getObjectSettings: getObjectColumnSettings,
    getSettingDefinitionsForObject: getSettingDefinitionsForColumn,
    component: ChartNestedSettingColumns,
    getInheritedSettingsForObject: getInheritedSettingsForColumn,
    useRawSeries: true,
    hidden,
    ...def,
  });
}

export function getGlobalSettingsForColumn(): Record<string, unknown> {
  const columnSettings: Record<string, unknown> = {};
  const customFormatting = (MetabaseSettings.get("custom-formatting") as Record<string, unknown>) || {};

  // NOTE: the order of these doesn't matter as long as there's no overlap between settings
  for (const [, globalSettings] of Object.entries(customFormatting)) {
    Object.assign(columnSettings, globalSettings);
  }

  return columnSettings;
}

function getLocalSettingsForColumn(column: DatasetColumn): Record<string, unknown> {
  return (column as DatasetColumn & { settings?: Record<string, unknown> }).settings || {};
}

function getInheritedSettingsForColumn(column: DatasetColumn): Record<string, unknown> {
  return {
    ...getGlobalSettingsForColumn(),
    ...getLocalSettingsForColumn(column),
  };
}

function getTimeEnabledOptionsForUnit(unit) {
  const options = [
    { name: t`Off`, value: null },
    { name: t`HH:MM`, value: "minutes" },
  ];

  if (
    !unit ||
    unit === "default" ||
    unit === "second" ||
    unit === "millisecond"
  ) {
    options.push({ name: t`HH:MM:SS`, value: "seconds" });
  }

  if (!unit || unit === "default" || unit === "millisecond") {
    options.push({ name: t`HH:MM:SS.MS`, value: "milliseconds" });
  }

  if (options.length === 2) {
    options[1].name = t`On`;
  }

  return options;
}

export const DATE_COLUMN_SETTINGS = {
  date_style: {
    get title() {
      return t`Date style`;
    },
    widget: "select",
    getDefault: ({ unit }) => {
      // Grab the first option's value. If there were no options (for
      // hour-of-day probably), use an empty format string instead.
      const [{ value = "" } = {}] = getDateStyleOptionsForUnit(unit);
      return value;
    },
    isValid: ({ unit }, settings) => {
      const options = getDateStyleOptionsForUnit(unit);
      return !!_.findWhere(options, { value: settings["date_style"] });
    },
    getProps: ({ unit }, settings) => ({
      options: getDateStyleOptionsForUnit(
        unit,
        settings["date_abbreviate"],
        settings["date_separator"],
      ),
    }),
    getHidden: ({ unit }) => getDateStyleOptionsForUnit(unit).length < 2,
  },
  date_separator: {
    get title() {
      return t`Date separators`;
    },
    widget: "radio",
    default: "/",
    getProps: (column, settings) => {
      const style = /\//.test(settings["date_style"])
        ? settings["date_style"]
        : "M/D/YYYY";
      return {
        options: [
          { name: style, value: "/" },
          { name: style.replace(/\//g, "-"), value: "-" },
          { name: style.replace(/\//g, "."), value: "." },
        ],
      };
    },
    getHidden: ({ unit }, settings) => !/\//.test(settings["date_style"] || ""),
  },
  date_abbreviate: {
    get title() {
      return t`Abbreviate days and months`;
    },
    widget: "toggle",
    default: false,
    inline: true,
    getHidden: ({ unit }, settings) => {
      const format = getDateFormatFromStyle(settings["date_style"], unit);
      return !format.match(/MMMM|dddd/);
    },
    readDependencies: ["date_style"],
  },
  time_enabled: {
    get title() {
      return t`Show the time`;
    },
    widget: "radio",
    isValid: ({ unit }, settings) => {
      const options = getTimeEnabledOptionsForUnit(unit);
      return !!_.findWhere(options, { value: settings["time_enabled"] });
    },
    getProps: ({ unit }, settings) => {
      const options = getTimeEnabledOptionsForUnit(unit);
      return { options };
    },
    getHidden: (column, settings) =>
      !hasHour(column.unit) || isDateWithoutTime(column),
    getDefault: ({ unit }) => (hasHour(unit) ? "minutes" : null),
  },
  time_style: {
    get title() {
      return t`Time style`;
    },
    widget: "radio",
    default: "h:mm A",
    getProps: (column) => ({
      options: getTimeStyleOptions(column.unit),
    }),
    getHidden: (column, settings) =>
      !settings["time_enabled"] || isDateWithoutTime(column),
    readDependencies: ["time_enabled"],
  },
};

export const NUMBER_COLUMN_SETTINGS = {
  number_style: {
    get title() {
      return t`Style`;
    },
    widget: "select",
    props: {
      options: [
        {
          get name() {
            return t`Normal`;
          },
          value: "decimal",
        },
        {
          get name() {
            return t`Percent`;
          },
          value: "percent",
        },
        {
          get name() {
            return t`Scientific`;
          },
          value: "scientific",
        },
        {
          get name() {
            return t`Currency`;
          },
          value: "currency",
        },
      ],
    },
    getDefault: getDefaultNumberStyle,
    // hide this for currency
    getHidden: (column, settings) =>
      isCurrency(column) && settings["number_style"] === "currency",
    readDependencies: ["currency"],
  },
  currency: {
    get title() {
      return t`Unit of currency`;
    },
    widget: "select",
    props: {
      // FIXME: rest of these options
      options: currency.map(([_, currency]) => ({
        name: currency.name,
        value: currency.code,
      })),
      searchProp: "name",
      searchCaseSensitive: false,
    },
    getDefault: getDefaultCurrency,
    getHidden: (column, settings) => settings["number_style"] !== "currency",
  },
  currency_style: {
    get title() {
      return t`Currency label style`;
    },
    widget: "radio",
    getProps: (column, settings) => {
      return {
        options: getCurrencyStyleOptions(
          settings["currency"] || "USD",
          settings["currency_style"],
        ),
      };
    },
    getDefault: getDefaultCurrencyStyle,
    getHidden: (column, settings) => settings["number_style"] !== "currency",
    readDependencies: ["number_style"],
  },
  currency_in_header: {
    get title() {
      return t`Where to display the unit of currency`;
    },
    widget: "radio",
    getProps: (_series, _vizSettings, onChange) => {
      return {
        onChange: (value) => onChange(value === true),
        options: [
          { name: t`In the column heading`, value: true },
          { name: t`In every table cell`, value: false },
        ],
      };
    },
    getDefault: getDefaultCurrencyInHeader,
    getHidden: (_column, settings, { series, forAdminSettings }) => {
      if (forAdminSettings === true) {
        return false;
      } else {
        return (
          settings["number_style"] !== "currency" ||
          series[0].card.display !== "table"
        );
      }
    },
    readDependencies: ["number_style"],
  },
  number_separators: {
    // uses 1-2 character string to represent decimal and thousands separators
    get title() {
      return t`Separator style`;
    },
    widget: "select",
    props: {
      options: [
        { name: "100,000.00", value: ".," },
        { name: "100 000,00", value: ", " },
        { name: "100.000,00", value: ",." },
        { name: "100000.00", value: "." },
        { name: "100’000.00", value: ".’" },
      ],
    },
    getDefault: getDefaultNumberSeparators,
  },
  decimals: {
    get title() {
      return t`Number of decimal places`;
    },
    widget: "number",
    props: {
      placeholder: "1",
      options: {
        isNonNegative: true,
        isInteger: true,
      },
    },
  },
  scale: {
    get title() {
      return t`Multiply by a number`;
    },
    widget: "number",
    props: {
      placeholder: "1",
    },
  },
  prefix: {
    get title() {
      return t`Add a prefix`;
    },
    widget: "input",
    props: {
      placeholder: "$",
    },
  },
  suffix: {
    get title() {
      return t`Add a suffix`;
    },
    widget: "input",
    props: {
      get placeholder() {
        return t`dollars`;
      },
    },
  },
  // Optimization: build a single NumberFormat object that is used by formatting.js
  _numberFormatter: {
    getValue: (column, settings) => numberFormatterForOptions(settings),
    // NOTE: make sure to include every setting that affects the number formatter here
    readDependencies: [
      "number_style",
      "currency_style",
      "currency",
      "decimals",
    ],
  },
  _header_unit: {
    getValue: (column, settings) => {
      if (
        settings["number_style"] === "currency" &&
        settings["currency_in_header"]
      ) {
        if (settings["currency_style"] === "symbol") {
          return getCurrencySymbol(settings["currency"]);
        }
        if (settings["currency_style"] === "narrowSymbol") {
          return getCurrencyNarrowSymbol(settings["currency"]);
        }
        return getCurrency(settings["currency"], settings["currency_style"]);
      }
      return null;
    },
    readDependencies: [
      "number_style",
      "currency",
      "currency_style",
      "currency_header_only",
    ],
  },
};

const COMMON_COLUMN_SETTINGS = {
  // markdown_template: {
  //   title: t`Markdown template`,
  //   widget: "input",
  //   props: {
  //     placeholder: "{{value}}",
  //   },
  // },
  column: {
    getValue: (column) => column,
  },
  _column_title_full: {
    getValue: (column, settings) => {
      let columnTitle =
        settings["column_title"] || displayNameForColumn(column);
      const headerUnit = settings["_header_unit"];
      if (headerUnit) {
        columnTitle += ` (${headerUnit})`;
      }
      return columnTitle;
    },
    readDependencies: ["column_title", "_header_unit"],
  },
};

export function getSettingDefinitionsForColumn(
  series: RawSeries,
  column: DatasetColumn,
): Record<string, unknown> {
  const visualization = getVisualizationRaw(series);
  const extraColumnSettings =
    typeof visualization.columnSettings === "function"
      ? visualization.columnSettings(column)
      : visualization.columnSettings || {};

  if (isDate(column) || (column.unit && column.unit !== "default")) {
    return {
      ...extraColumnSettings,
      ...DATE_COLUMN_SETTINGS,
      ...COMMON_COLUMN_SETTINGS,
    };
  } else if (isNumber(column) && !isCoordinate(column)) {
    return {
      ...extraColumnSettings,
      ...NUMBER_COLUMN_SETTINGS,
      ...COMMON_COLUMN_SETTINGS,
    };
  } else {
    return {
      ...extraColumnSettings,
      ...COMMON_COLUMN_SETTINGS,
    };
  }
}

export function isPivoted(
  series: RawSeries,
  settings: VisualizationSettings,
): boolean {
  const [{ data }] = series;

  if (!settings["table.pivot"]) {
    return false;
  }

  const pivotIndex = _.findIndex(
    data.cols,
    (col) => col.name === settings["table.pivot_column"],
  );
  const cellIndex = _.findIndex(
    data.cols,
    (col) => col.name === settings["table.cell_column"],
  );
  const normalIndex = _.findIndex(
    data.cols,
    (col, index) => index !== pivotIndex && index !== cellIndex,
  );

  return pivotIndex >= 0 && cellIndex >= 0 && normalIndex >= 0;
}

export const getTitleForColumn = (
  column: DatasetColumn,
  series: RawSeries,
  settings: VisualizationSettings & { column?: (col: DatasetColumn) => Record<string, unknown> },
): string => {
  const pivoted = isPivoted(series, settings);
  if (pivoted) {
    return displayNameForColumn(column) || t`Unset`;
  } else {
    return (
      settings.column(column)["_column_title_full"] ||
      displayNameForColumn(column)
    );
  }
};

export function tableColumnSettings({
  isShowingDetailsOnlyColumns = false,
}: { isShowingDetailsOnlyColumns?: boolean } = {}) {
  return {
    "table.columns": {
      get section() {
        return t`Columns`;
      },
      // title: t`Columns`,
      widget: ChartSettingTableColumns,
      getHidden: (series, vizSettings) => vizSettings["table.pivot"],
      getValue: ([{ data }], vizSettings) => {
        const { cols } = data;
        const settings = vizSettings["table.columns"] ?? [];
        const uniqColumnSettings = getDeduplicatedTableColumnSettings(settings);

        const columnIndexes = findColumnIndexesForColumnSettings(
          cols,
          uniqColumnSettings,
        );
        const settingIndexes = findColumnSettingIndexesForColumns(
          cols,
          uniqColumnSettings,
        );

        return [
          // retain settings with matching columns only
          ...uniqColumnSettings.filter(
            (_, settingIndex) => columnIndexes[settingIndex] >= 0,
          ),
          // add columns that do not have matching settings to the end
          ...cols
            .filter((_, columnIndex) => settingIndexes[columnIndex] < 0)
            .map((column) => ({
              name: column.name,
              enabled: true,
            })),
        ];
      },
      getProps: (series, settings) => {
        const [
          {
            data: { cols },
          },
        ] = series;

        return {
          columns: cols,
          isShowingDetailsOnlyColumns,
          getColumnName: (column) =>
            getTitleForColumn(column, series, settings),
        };
      },
    },
  };
}
