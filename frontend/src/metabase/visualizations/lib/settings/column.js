import { t } from "c-3po";
import moment from "moment";

import { nestedSettings } from "./nested";
import ChartNestedSettingColumns from "metabase/visualizations/components/settings/ChartNestedSettingColumns.jsx";

import { keyForColumn } from "metabase/lib/dataset";
import { isDate, isNumber, isCoordinate } from "metabase/lib/schema_metadata";
import { getVisualizationRaw } from "metabase/visualizations";
import { numberFormatterForOptions } from "metabase/lib/formatting";
import {
  DEFAULT_DATE_STYLE,
  getDateFormatFromStyle,
  hasDay,
  hasHour,
} from "metabase/lib/formatting/date";

const DEFAULT_GET_COLUMNS = (series, vizSettings) =>
  [].concat(...series.map(s => s.data.cols));

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  ...def
} = {}) {
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

function getDateStyleOptionsForUnit(unit) {
  const options = [
    dateStyleOption("M/D/YY", unit, hasDay(unit) && "month, day, year"),
    dateStyleOption("D/M/YY", unit, hasDay(unit) && "day, month, year"),
    dateStyleOption("YYYY/M/D", unit, hasDay(unit) && "year, month, day"),
    dateStyleOption("MMMM D, YYYY", unit),
    dateStyleOption("D MMMM, YYYY", unit),
    dateStyleOption("dddd, MMMM D, YYYY", unit),
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

function dateStyleOption(style, unit, description) {
  const format = getDateFormatFromStyle(style, unit);
  return {
    name:
      EXAMPLE_DATE.format(format) + (description ? ` (${description})` : ``),
    value: style,
  };
}

function timeStyleOption(style, description) {
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
    getProps: ({ unit }) => ({
      options: getDateStyleOptionsForUnit(unit),
    }),
    getHidden: ({ unit }) => getDateStyleOptionsForUnit(unit).length < 2,
  },
  date_abbreviate: {
    title: t`Abbreviate names of days and months`,
    widget: "toggle",
    default: false,
    getHidden: ({ unit }, settings) => {
      const format = getDateFormatFromStyle(settings["date_style"], unit);
      return !format.match(/MMMM|dddd/);
    },
    readDependencies: ["date_style"],
  },
  time_enabled: {
    title: t`Show the time`,
    widget: "buttonGroup",
    getProps: ({ unit }, settings) => {
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
    getHidden: ({ unit }, settings) => !hasHour(unit),
    getDefault: ({ unit }) => (hasHour(unit) ? "minutes" : null),
  },
  time_style: {
    title: t`Time style`,
    widget: "radio",
    default: "h:mm A",
    getProps: (column, settings) => ({
      options: [
        timeStyleOption("h:mm A", "12-hour clock"),
        timeStyleOption("k:mm", "24-hour clock"),
      ],
    }),
    getHidden: (column, settings) => !settings["time_enabled"],
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
  // markdown_template: {
  //   title: t`Markdown template`,
  //   widget: "input",
  //   props: {
  //     placeholder: "{{value}}",
  //   },
  // },
};

export function getSettingDefintionsForColumn(series, column) {
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
