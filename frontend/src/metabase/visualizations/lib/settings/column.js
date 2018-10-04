/* @flow */

import { t } from "c-3po";
import moment from "moment";

import { nestedSettings } from "./nested";
import ChartNestedSettingColumns from "metabase/visualizations/components/settings/ChartNestedSettingColumns";

import { keyForColumn } from "metabase/lib/dataset";
import {
  isDate,
  isNumber,
  isCoordinate,
  isCurrency,
} from "metabase/lib/schema_metadata";

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

import currency from "metabase/lib/currency";

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
    component: ChartNestedSettingColumns,
    getInheritedSettingsForObject: getInhertiedSettingsForColumn,
    useRawSeries: true,
    ...def,
  });
}

import MetabaseSettings from "metabase/lib/settings";
import { isa } from "metabase/lib/types";

export function getGlobalSettingsForColumn(column) {
  let settings = {};

  const customFormatting = MetabaseSettings.get("custom-formatting");
  // NOTE: the order of these doesn't matter as long as there's no overlap between settings
  for (const [type, globalSettings] of Object.entries(customFormatting || {})) {
    if (isa(column.special_type, type)) {
      Object.assign(settings, globalSettings);
    }
  }

  return settings;
}

function getLocalSettingsForColumn(column) {
  return column.settings || {};
}

function getInhertiedSettingsForColumn(column) {
  return {
    ...getGlobalSettingsForColumn(column),
    ...getLocalSettingsForColumn(column),
  };
}

const EXAMPLE_DATE = moment("2018-01-07 17:24");

function getDateStyleOptionsForUnit(
  unit: ?DatetimeUnit,
  abbreviate?: boolean = false,
) {
  const options = [
    dateStyleOption("MMMM D, YYYY", unit, null, abbreviate),
    dateStyleOption("D MMMM, YYYY", unit, null, abbreviate),
    dateStyleOption("dddd, MMMM D, YYYY", unit, null, abbreviate),
    dateStyleOption(
      "M/D/YYYY",
      unit,
      hasDay(unit) ? "month, day, year" : null,
      abbreviate,
    ),
    dateStyleOption(
      "D/M/YYYY",
      unit,
      hasDay(unit) ? "day, month, year" : null,
      abbreviate,
    ),
    dateStyleOption(
      "YYYY/M/D",
      unit,
      hasDay(unit) ? "year, month, day" : null,
      abbreviate,
    ),
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
  abbreviate?: boolean = false,
) {
  let format = getDateFormatFromStyle(style, unit);
  if (abbreviate) {
    format = format.replace(/MMMM/, "MMM").replace(/dddd/, "ddd");
  }
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
    widget: "select",
    default: DEFAULT_DATE_STYLE,
    getProps: ({ unit }: Column, settings: ColumnSettings) => ({
      options: getDateStyleOptionsForUnit(unit, settings["date_abbreviate"]),
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
        { name: "Currency", value: "currency" },
      ],
    },
    getDefault: (column, settings) =>
      isCurrency(column) && settings["currency"] ? "currency" : "decimal",
    // hide this for currency
    getHidden: (column, settings) =>
      isCurrency(column) && settings["number_style"] === "currency",
  },
  currency: {
    title: t`Currency`,
    widget: "select",
    props: {
      // FIXME: rest of these options
      options: Object.values(currency).map(currency => ({
        name: currency.name,
        value: currency.code,
      })),
    },
    default: "USD",
    getHidden: (column: Column, settings: ColumnSettings) =>
      settings["number_style"] !== "currency",
    readDependencies: ["number_style"],
  },
  currency_style: {
    title: t`Currency label style`,
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
    readDependencies: ["number_style"],
  },
  currency_in_header: {
    title: t`Where to display the unit of currency`,
    widget: "radio",
    props: {
      options: [
        { name: "In the column heading", value: true },
        { name: "In every table cell", value: false },
      ],
    },
    default: true,
    getHidden: (column: Column, settings: ColumnSettings, { series }) =>
      settings["number_style"] !== "currency" ||
      series[0].card.display !== "table",
    readDependencies: ["number_style"],
  },
  locale: {
    title: t`Separator style`,
    widget: "select",
    props: {
      options: [
        { name: "100,000.00", value: "en" },
        { name: "100 000,00", value: "fr" },
        { name: "100.000,00", value: "de" },
        { name: "100000.00", value: null },
      ],
    },
    default: "en",
  },
  decimals: {
    title: t`Minimum number of decimal places`,
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
  _header_unit: {
    getValue: (column: Column, settings: ColumnSettings) => {
      if (
        settings["number_style"] === "currency" &&
        settings["currency_in_header"]
      ) {
        return (0)
          .toLocaleString(settings["locale"] || "en", {
            style: "currency",
            currency: settings["currency"],
            currencyDisplay: settings["currency_style"],
          })
          .replace(/0([.,]0+)?/, "")
          .trim(); // strip off actual number
      }
      return null;
    },
    readDependencies: [
      "number_style",
      "currency",
      "currency_style",
      "currency_header_only",
      "locale",
    ],
  },
  _column_title_full: {
    getValue: (column, settings) => {
      let columnTitle = settings["column_title"];
      const headerUnit = settings["_header_unit"];
      if (headerUnit) {
        columnTitle += ` (${headerUnit})`;
      }
      return columnTitle;
    },
    readDependencies: ["column_title", "_header_unit"],
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
    getValue: column => column,
  },
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
