/* @flow */

import { t } from "ttag";
import moment from "moment";
import _ from "underscore";

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

import {
  formatColumn,
  numberFormatterForOptions,
} from "metabase/lib/formatting";
import {
  getDateFormatFromStyle,
  hasDay,
  hasHour,
} from "metabase/lib/formatting/date";

import currency from "metabase/lib/currency";

import type { Settings, SettingDef } from "../settings";
import type { DateStyle, TimeStyle } from "metabase/lib/formatting/date";
import type { DatetimeUnit } from "metabase-types/types/Query";
import type { Column } from "metabase-types/types/Dataset";
import type { Series } from "metabase-types/types/Visualization";
import type { VisualizationSettings } from "metabase-types/types/Card";

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
}: ColumnSettingDef = {}) {
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

export function getGlobalSettingsForColumn(column: Column) {
  const settings = {};

  const customFormatting = MetabaseSettings.get("custom-formatting");
  // NOTE: the order of these doesn't matter as long as there's no overlap between settings
  for (const [type, globalSettings] of Object.entries(customFormatting || {})) {
    if (isa(column.special_type || column.base_type, type)) {
      // $FlowFixMe
      Object.assign(settings, globalSettings);
    }
  }

  return settings;
}

function getLocalSettingsForColumn(column: Column): Settings {
  return column.settings || {};
}

function getInhertiedSettingsForColumn(column: Column): Settings {
  return {
    ...getGlobalSettingsForColumn(column),
    ...getLocalSettingsForColumn(column),
  };
}

const EXAMPLE_DATE = moment("2018-01-07 17:24");

function getDateStyleOptionsForUnit(
  unit: ?DatetimeUnit,
  abbreviate?: boolean = false,
  separator?: string,
) {
  // hour-of-day shouldn't have any date style. It's handled as a time instead.
  // Other date parts are handled as dates, but hour-of-day needs to use the
  // time settings for 12/24 hour clock.
  if (unit === "hour-of-day") {
    return [];
  }

  const options = [
    dateStyleOption("MMMM D, YYYY", unit, null, abbreviate, separator),
    dateStyleOption("D MMMM, YYYY", unit, null, abbreviate, separator),
    dateStyleOption("dddd, MMMM D, YYYY", unit, null, abbreviate, separator),
    dateStyleOption(
      "M/D/YYYY",
      unit,
      hasDay(unit) ? "month, day, year" : null,
      abbreviate,
      separator,
    ),
    dateStyleOption(
      "D/M/YYYY",
      unit,
      hasDay(unit) ? "day, month, year" : null,
      abbreviate,
      separator,
    ),
    dateStyleOption(
      "YYYY/M/D",
      unit,
      hasDay(unit) ? "year, month, day" : null,
      abbreviate,
      separator,
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
  separator?: string,
) {
  let format = getDateFormatFromStyle(style, unit, separator);
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
    getDefault: ({ unit }: Column) => {
      // Grab the first option's value. If there were no options (for
      // hour-of-day probably), use an empty format string instead.
      const [{ value = "" } = {}] = getDateStyleOptionsForUnit(unit);
      return value;
    },
    isValid: ({ unit }: Column, settings: ColumnSettings) => {
      const options = getDateStyleOptionsForUnit(unit);
      return !!_.findWhere(options, { value: settings["date_style"] });
    },
    getProps: ({ unit }: Column, settings: ColumnSettings) => ({
      options: getDateStyleOptionsForUnit(
        unit,
        settings["date_abbreviate"],
        settings["date_separator"],
      ),
    }),
    getHidden: ({ unit }: Column) =>
      getDateStyleOptionsForUnit(unit).length < 2,
  },
  date_separator: {
    title: t`Date separators`,
    widget: "radio",
    default: "/",
    getProps: (column: Column, settings: ColumnSettings) => {
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
    getHidden: ({ unit }: Column, settings: ColumnSettings) =>
      !/\//.test(settings["date_style"] || ""),
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
    widget: "radio",
    isValid: ({ unit }: Column, settings: ColumnSettings) =>
      !settings["time_enabled"] || hasHour(unit),
    getProps: ({ unit }: Column, settings: ColumnSettings) => {
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
        timeStyleOption("h:mm A", t`12-hour clock`),
        ...(column.unit === "hour-of-day"
          ? [timeStyleOption("h A", "12-hour clock without minutes")]
          : []),
        timeStyleOption("k:mm", t`24-hour clock`),
      ],
    }),
    getHidden: (column: Column, settings: ColumnSettings) =>
      !settings["time_enabled"],
    readDependencies: ["time_enabled"],
  },
};

function getCurrency(currency, currencyStyle) {
  return (0)
    .toLocaleString("en", {
      style: "currency",
      currency: currency,
      currencyDisplay: currencyStyle,
    })
    .replace(/0([.,]0+)?/, "")
    .trim(); // strip off actual number
}

export const NUMBER_COLUMN_SETTINGS = {
  number_style: {
    title: t`Style`,
    widget: "select",
    props: {
      options: [
        { name: "Normal", value: "decimal" },
        { name: "Percent", value: "percent" },
        { name: "Scientific", value: "scientific" },
        { name: "Currency", value: "currency" },
      ],
    },
    getDefault: (column: Column, settings: ColumnSettings) =>
      isCurrency(column) && settings["currency"] ? "currency" : "decimal",
    // hide this for currency
    getHidden: (column: Column, settings: ColumnSettings) =>
      isCurrency(column) && settings["number_style"] === "currency",
    readDependencies: ["currency"],
  },
  currency: {
    title: t`Unit of currency`,
    widget: "select",
    props: {
      // FIXME: rest of these options
      options: Object.values(currency).map(
        // $FlowFixMe
        (currency: { name: string, code: string }) => ({
          name: currency.name,
          value: currency.code,
        }),
      ),
      searchProp: "name",
      searchCaseSensitive: false,
    },
    default: "USD",
    getHidden: (column: Column, settings: ColumnSettings) =>
      // NOTE: ideally we'd hide this if number_style != "currency" but that would result in a circular dependency
      !isCurrency(column),
  },
  currency_style: {
    title: t`Currency label style`,
    widget: "radio",
    getProps: (column: Column, settings: ColumnSettings) => {
      const c = settings["currency"] || "USD";
      return {
        options: [
          {
            name: t`Symbol` + ` ` + `(${getCurrency(c, "symbol")})`,
            value: "symbol",
          },
          {
            name: t`Code` + ` ` + `(${getCurrency(c, "code")})`,
            value: "code",
          },
          {
            name: t`Name` + ` ` + `(${getCurrency(c, "name")})`,
            value: "name",
          },
        ],
      };
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
        { name: t`In the column heading`, value: true },
        { name: t`In every table cell`, value: false },
      ],
    },
    default: true,
    getHidden: (
      column: Column,
      settings: ColumnSettings,
      { series }: { series: Series },
    ) =>
      settings["number_style"] !== "currency" ||
      series[0].card.display !== "table",
    readDependencies: ["number_style"],
  },
  number_separators: {
    // uses 1-2 character string to represent decimal and thousands separators
    title: t`Separator style`,
    widget: "select",
    props: {
      options: [
        { name: "100,000.00", value: ".," },
        { name: "100 000,00", value: ", " },
        { name: "100.000,00", value: ",." },
        { name: "100000.00", value: "." },
      ],
    },
    default: ".,",
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
      "decimals",
    ],
  },
  _header_unit: {
    getValue: (column: Column, settings: ColumnSettings) => {
      if (
        settings["number_style"] === "currency" &&
        settings["currency_in_header"]
      ) {
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
    getValue: column => column,
  },
  _column_title_full: {
    getValue: (column: Column, settings: ColumnSettings) => {
      let columnTitle = settings["column_title"] || formatColumn(column);
      const headerUnit = settings["_header_unit"];
      if (headerUnit) {
        columnTitle += ` (${headerUnit})`;
      }
      return columnTitle;
    },
    readDependencies: ["column_title", "_header_unit"],
  },
};

export function getSettingDefintionsForColumn(series: Series, column: Column) {
  const { visualization } = getVisualizationRaw(series);
  const extraColumnSettings =
    typeof visualization.columnSettings === "function"
      ? visualization.columnSettings(column)
      : visualization.columnSettings || {};

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
