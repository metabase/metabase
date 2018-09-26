/* @flow */

import { t } from "c-3po";
import moment from "moment";

import { nestedSettings } from "./nested";
import ChartNestedSettingColumns from "metabase/visualizations/components/settings/ChartNestedSettingColumns.jsx";

import { keyForColumn } from "metabase/lib/dataset";
import { isDate, isNumber, isCoordinate } from "metabase/lib/schema_metadata";

// HACK: cyclical dependency causing errors in unit tests
// import { getVisualizationRaw } from "metabase/visualizations";
function getVisualizationRaw(...args) {
  return require("metabase/visualizations").getVisualizationRaw(...args);
}

import { numberFormatterForOptions } from "metabase/lib/formatting";
import {
  DEFAULT_DATE_STYLE,
  getDateFormatFromStyle,
  hasDay,
  hasHour,
} from "metabase/lib/formatting/date";

import type { Settings, SettingDef } from "../settings";
import type { DateStyle, TimeStyle } from "metabase/lib/formatting/date";
import type { DatetimeUnit } from "metabase/meta/types/Query";
import type { Column } from "metabase/meta/types/Dataset";
import type { Series } from "metabase/meta/types/Visualization";
import type { VisualizationSettings } from "metabase/meta/types/Card";

type ColumnSettings = Settings;

type ColumnGetter = (
  series: Series,
  vizSettings: VisualizationSettings,
) => Column[];

const DEFAULT_GET_COLUMNS: ColumnGetter = (series, vizSettings) =>
  [].concat(...series.map(s => s.data.cols));

type ColumnSettingDef = SettingDef & {
  getColumns?: ColumnGetter,
};

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  ...def
}: ColumnSettingDef) {
  return nestedSettings("column_settings", {
    section: t`Formatting`,
    objectName: "column",
    getObjects: getColumns,
    getObjectKey: keyForColumn,
    getSettingDefintionsForObject: getSettingDefintionsForColumn,
    getObjectSettingsExtra: (series, settings, object) => ({ column: object }),
    component: ChartNestedSettingColumns,
    useRawSeries: true,
    ...def,
  });
}

const EXAMPLE_DATE = moment("2018-01-07 17:24");

function getDateStyleOptionsForUnit(unit: ?DatetimeUnit) {
  const options = [
    dateStyleOption("MMMM D, YYYY", unit),
    dateStyleOption("D MMMM, YYYY", unit),
    dateStyleOption("dddd, MMMM D, YYYY", unit),
    dateStyleOption("M/D/YYYY", unit, hasDay(unit) ? "month, day, year" : null),
    dateStyleOption("D/M/YYYY", unit, hasDay(unit) ? "day, month, year" : null),
    dateStyleOption("YYYY/M/D", unit, hasDay(unit) ? "year, month, day" : null),
  ];
  const seen = new Set();
  return options.filter(option => {
    const format = getDateFormatFromStyle(option.value, unit);
    if (seen.has(format)) {
      return false;
    } else {
      seen.add(format);
      return true;
    }
  });
}

function dateStyleOption(
  style: DateStyle,
  unit: ?DatetimeUnit,
  description?: ?string,
) {
  const format = getDateFormatFromStyle(style, unit);
  return {
    name:
      EXAMPLE_DATE.format(format) + (description ? ` (${description})` : ``),
    value: style,
  };
}

function timeStyleOption(style: TimeStyle, description?: ?string) {
  const format = style;
  return {
    name:
      EXAMPLE_DATE.format(format) + (description ? ` (${description})` : ``),
    value: style,
  };
}

export const DATE_COLUMN_SETTINGS = {
  date_style: {
    title: t`Date style`,
    widget: "radio",
    default: DEFAULT_DATE_STYLE,
    getProps: ({ unit }: Column) => ({
      options: getDateStyleOptionsForUnit(unit),
    }),
    getHidden: ({ unit }: Column) =>
      getDateStyleOptionsForUnit(unit).length < 2,
  },
  date_abbreviate: {
    title: t`Abbreviate names of days and months`,
    widget: "toggle",
    default: false,
    getHidden: ({ unit }: Column, settings: ColumnSettings) => {
      const format = getDateFormatFromStyle(settings["date_style"], unit);
      return !format.match(/MMMM|dddd/);
    },
    readDependencies: ["date_style"],
  },
  time_enabled: {
    title: t`Show the time`,
    widget: "buttonGroup",
    isValid: ({ unit }: Column, settings: ColumnSettings) =>
      !settings["time_enabled"] || hasHour(unit),
    getProps: ({ unit }: Column, settings: ColumnSettings) => {
      const options = [
        { name: t`Off`, value: null },
        { name: t`Minutes`, value: "minutes" },
      ];
      if (!unit || unit === "default" || unit === "second") {
        options.push({ name: t`Seconds`, value: "seconds" });
      }
      if (!unit || unit === "default") {
        options.push({ name: t`Milliseconds`, value: "milliseconds" });
      }
      if (options.length === 2) {
        options[1].name = t`On`;
      }
      return { options };
    },
    getHidden: ({ unit }: Column, settings: ColumnSettings) => !hasHour(unit),
    getDefault: ({ unit }: Column) => (hasHour(unit) ? "minutes" : null),
  },
  time_style: {
    title: t`Time style`,
    widget: "radio",
    default: "h:mm A",
    getProps: (column: Column, settings: ColumnSettings) => ({
      options: [
        timeStyleOption("h:mm A", "12-hour clock"),
        timeStyleOption("k:mm", "24-hour clock"),
      ],
    }),
    getHidden: (column: Column, settings: ColumnSettings) =>
      !settings["time_enabled"],
    readDependencies: ["time_enabled"],
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
        // { name: "Currency", value: "currency" },
      ],
    },
    // TODO: default to currency for fields that are a currency type
    default: "decimal",
  },
  currency: {
    title: t`Currency`,
    widget: "select",
    props: {
      // FIXME: rest of these options
      options: [{ name: "USD", value: "USD" }, { name: "EUR", value: "EUR" }],
    },
    default: "USD",
    getHidden: (column: Column, settings: ColumnSettings) =>
      settings["number_style"] !== "currency",
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
    getHidden: (column: Column, settings: ColumnSettings) =>
      settings["number_style"] !== "currency",
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
  prefix: {
    title: t`Add a prefix`,
    widget: "input",
  },
  suffix: {
    title: t`Add a suffix`,
    widget: "input",
  },
  // Optimization: build a single NumberFormat object that is used by formatting.js
  _numberFormatter: {
    getValue: (column: Column, settings: ColumnSettings) =>
      numberFormatterForOptions(settings),
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
  // markdown_template: {
  //   title: t`Markdown template`,
  //   widget: "input",
  //   props: {
  //     placeholder: "{{value}}",
  //   },
  // },
};

export function getSettingDefintionsForColumn(series: Series, column: Column) {
  const { CardVisualization } = getVisualizationRaw(series);
  const extraColumnSettings =
    typeof CardVisualization.columnSettings === "function"
      ? CardVisualization.columnSettings(column)
      : CardVisualization.columnSettings || {};

  if (isDate(column)) {
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
