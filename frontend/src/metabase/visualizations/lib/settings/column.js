import { t } from "c-3po";
import _ from "underscore";

import ChartSettingColumnSettings from "metabase/visualizations/components/settings/ChartSettingColumnSettings";

import { keyForColumn } from "metabase/lib/dataset";
import { isDate, isNumber } from "metabase/lib/schema_metadata";
import { getVisualizationRaw } from "metabase/visualizations";
import { getComputedSettings, getSettingsWidgets } from "../settings";
import { numberFormatterForOptions } from "metabase/lib/formatting";

const DEFAULT_GET_COLUMNS = (series, vizSettings) =>
  [].concat(...series.map(s => s.data.cols));

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  ...def
} = {}) {
  return {
    column_settings: {
      section: t`Formatting`,
      widget: ChartSettingColumnSettings,
      default: {},
      getProps: (series, settings) => ({
        series,
        settings,
        columns: getColumns(series, settings),
      }),
      useRawSeries: true,
      ...def,
    },
    // HACK: adds a "column" function to settings to get column-level settings that should be passed to formatValue
    // e.x. formatValue(data.rows[0][0], settings.column(data.cols[0]))
    column: {
      getDefault(series, settings) {
        const cache = new Map();
        return column => {
          const key = keyForColumn(column);
          if (!cache.has(key)) {
            cache.set(key, {
              ...getComputedSettingsForColumn(
                series,
                column,
                settings["column_settings"][key] || {},
              ),
              column,
            });
          }
          return cache.get(key);
        };
      },
      readDependencies: ["column_settings"],
    },
  };
}

import moment from "moment";

const EXAMPLE_DATE = moment("2018-01-07 17:24");

function dateTimeFormatOption(format, description) {
  return {
    name:
      EXAMPLE_DATE.format(format) + (description ? ` (${description})` : ``),
    value: format,
  };
}

export const DATE_COLUMN_SETTINGS = {
  date_format: {
    title: t`Date style`,
    widget: "radio",
    default: "dddd, MMMM D, YYYY",
    props: {
      options: [
        dateTimeFormatOption("M/D/YYYY", "month, day, year"),
        dateTimeFormatOption("D/M/YYYY", "day, month, year"),
        dateTimeFormatOption("YYYY/M/D", "year, month, day"),
        dateTimeFormatOption("MMMM D, YYYY"),
        dateTimeFormatOption("D MMMM YYYY"),
        dateTimeFormatOption("dddd, MMMM D, YYYY"),
      ],
    },
  },
  date_abbreviate: {
    title: t`Abbreviate names of days and months`,
    widget: "toggle",
    default: false,
  },
  time_enabled: {
    title: t`Show the time`,
    widget: "toggle",
    default: true,
  },
  time_format: {
    title: t`Time style`,
    widget: "radio",
    default: "h:mm A",
    props: {
      options: [
        dateTimeFormatOption("h:mm A", "12-hour clock"),
        dateTimeFormatOption("k:mm", "24-hour clock"),
      ],
    },
    getHidden: (column, settings) => !settings["time_enabled"],
  },
};

export const NUMBER_COLUMN_SETTINGS = {
  number_style: {
    title: t`Style`,
    widget: "radio",
    props: {
      options: [
        { name: "Normal", value: "decimal" },
        { name: "Percent", value: "percent" },
        { name: "Scientific", value: "scientific" },
        { name: "Currency", value: "currency" },
      ],
    },
    // TODO: default to currency for fields that are a currency type
    default: "decimal",
  },
  currency: {
    title: t`Currency`,
    widget: "select",
    props: {
      options: [{ name: "USD", value: "USD" }, { name: "EUR", value: "EUR" }],
    },
    default: "USD",
    getHidden: (column, settings) => settings["number_style"] !== "currency",
  },
  currency_style: {
    title: t`Currency Style`,
    widget: "radio",
    props: {
      options: [
        { name: "Symbol ($)", value: "symbol" },
        { name: "Code (USD)", value: "code" },
        { name: "Name (US dollars)", value: "name" },
      ],
    },
    default: "symbol",
    getHidden: (column, settings) => settings["number_style"] !== "currency",
  },
  locale: {
    title: t`Separator style`,
    widget: "radio",
    props: {
      options: [
        { name: "100000.00", value: null },
        { name: "100,000.00", value: "en" },
        { name: "100 000,00", value: "fr" },
        { name: "100.000,00", value: "de" },
      ],
    },
    default: "en",
  },
  decimals: {
    title: t`Number of decimal places`,
    widget: "number",
  },
  scale: {
    title: t`Multiply by a number`,
    widget: "number",
    props: {
      placeholder: "1",
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
      "locale",
      "decimals",
    ],
  },
};

const COMMON_COLUMN_SETTINGS = {
  markdown_template: {
    title: t`Markdown template`,
    widget: "input",
    props: {
      placeholder: "{{value}}",
    },
  },
};

export function getSettingDefintionsForColumn(series, column) {
  console.log("series", series);
  const { CardVisualization } = getVisualizationRaw(series);
  const extraColumnSettings =
    typeof CardVisualization.columnSettings === "function"
      ? CardVisualization.columnSettings(column)
      : CardVisualization.columnSettings || {};
  console.log("extraColumnSettings", extraColumnSettings);

  if (isDate(column)) {
    return {
      ...extraColumnSettings,
      ...DATE_COLUMN_SETTINGS,
      ...COMMON_COLUMN_SETTINGS,
    };
  } else if (isNumber(column)) {
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

export function getComputedSettingsForColumn(series, column, storedSettings) {
  const settingsDefs = getSettingDefintionsForColumn(series, column);
  const computedSettings = getComputedSettings(
    settingsDefs,
    column,
    storedSettings,
  );
  // remove undefined settings since they override other settings when merging object
  return _.pick(computedSettings, value => value !== undefined);
}

export function getSettingsWidgetsForColumn(
  series,
  column,
  storedSettings,
  onChangeSettings,
) {
  const settingsDefs = getSettingDefintionsForColumn(series, column);
  const computedSettings = getComputedSettingsForColumn(
    series,
    column,
    storedSettings,
  );
  const widgets = getSettingsWidgets(
    settingsDefs,
    computedSettings,
    column,
    onChangeSettings,
  );
  return widgets;
}
