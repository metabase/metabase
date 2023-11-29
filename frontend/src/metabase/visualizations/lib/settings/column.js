import { t } from "ttag";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import _ from "underscore";

import ChartNestedSettingColumns from "metabase/visualizations/components/settings/ChartNestedSettingColumns";
import { ChartSettingTableColumns } from "metabase/visualizations/components/settings/ChartSettingTableColumns";

// HACK: cyclical dependency causing errors in unit tests
// import { getVisualizationRaw } from "metabase/visualizations";
function getVisualizationRaw(...args) {
  return require("metabase/visualizations").getVisualizationRaw(...args);
}

import {
  formatColumn,
  numberFormatterForOptions,
  getCurrencySymbol,
  getDateFormatFromStyle,
} from "metabase/lib/formatting";

import { hasHour } from "metabase/lib/formatting/datetime-utils";

import { currency } from "cljs/metabase.shared.util.currency";

const DEFAULT_GET_COLUMNS = (series, vizSettings) =>
  [].concat(...series.map(s => (s.data && s.data.cols) || []));

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  hidden,
  ...def
} = {}) {
  return nestedSettings("column_settings", {
    section: t`Formatting`,
    objectName: "column",
    getObjects: getColumns,
    getObjectKey: getColumnKey,
    getSettingDefinitionsForObject: getSettingDefinitionsForColumn,
    component: ChartNestedSettingColumns,
    getInheritedSettingsForObject: getInhertiedSettingsForColumn,
    useRawSeries: true,
    hidden,
    ...def,
  });
}

import MetabaseSettings from "metabase/lib/settings";
import {
  isDate,
  isNumber,
  isCoordinate,
  isCurrency,
  isDateWithoutTime,
  isPercentage,
} from "metabase-lib/types/utils/isa";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { nestedSettings } from "./nested";

export function getGlobalSettingsForColumn(column) {
  const columnSettings = {};
  const customFormatting = MetabaseSettings.get("custom-formatting") || {};

  // NOTE: the order of these doesn't matter as long as there's no overlap between settings
  for (const [, globalSettings] of Object.entries(customFormatting)) {
    Object.assign(columnSettings, globalSettings);
  }

  return columnSettings;
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

const EXAMPLE_DATE = moment("2018-01-31 17:24");

function getDateStyleOptionsForUnit(unit, abbreviate = false, separator) {
  // hour-of-day shouldn't have any date style. It's handled as a time instead.
  // Other date parts are handled as dates, but hour-of-day needs to use the
  // time settings for 12/24 hour clock.
  if (unit === "hour-of-day") {
    return [];
  }

  const options = [
    dateStyleOption("MMMM D, YYYY", unit, abbreviate, separator),
    dateStyleOption("D MMMM, YYYY", unit, abbreviate, separator),
    dateStyleOption("dddd, MMMM D, YYYY", unit, abbreviate, separator),
    dateStyleOption("M/D/YYYY", unit, abbreviate, separator),
    dateStyleOption("D/M/YYYY", unit, abbreviate, separator),
    dateStyleOption("YYYY/M/D", unit, abbreviate, separator),
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

function dateStyleOption(style, unit, abbreviate = false, separator) {
  let format = getDateFormatFromStyle(style, unit, separator);
  if (abbreviate) {
    format = format.replace(/MMMM/, "MMM").replace(/dddd/, "ddd");
  }
  return {
    name: EXAMPLE_DATE.format(format),
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
    title: t`Date style`,
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
    title: t`Date separators`,
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
    title: t`Abbreviate days and months`,
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
    title: t`Show the time`,
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
    title: t`Time style`,
    widget: "radio",
    default: "h:mm A",
    getProps: (column, settings) => ({
      options: [
        timeStyleOption("h:mm A", t`12-hour clock`),
        ...(column.unit === "hour-of-day"
          ? [timeStyleOption("h A", "12-hour clock without minutes")]
          : []),
        timeStyleOption("HH:mm", t`24-hour clock`),
      ],
    }),
    getHidden: (column, settings) =>
      !settings["time_enabled"] || isDateWithoutTime(column),
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
        { name: t`Normal`, value: "decimal" },
        { name: t`Percent`, value: "percent" },
        { name: t`Scientific`, value: "scientific" },
        { name: t`Currency`, value: "currency" },
      ],
    },
    getDefault: (column, settings) => {
      if (isCurrency(column) && settings["currency"]) {
        return "currency";
      }

      if (isPercentage(column)) {
        return "percent";
      }

      return "decimal";
    },
    // hide this for currency
    getHidden: (column, settings) =>
      isCurrency(column) && settings["number_style"] === "currency",
    readDependencies: ["currency"],
  },
  currency: {
    title: t`Unit of currency`,
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
    default: "USD",
    getHidden: (column, settings) => settings["number_style"] !== "currency",
  },
  currency_style: {
    title: t`Currency label style`,
    widget: "radio",
    getProps: (column, settings) => {
      const c = settings["currency"] || "USD";
      const symbol = getCurrencySymbol(c);
      const code = getCurrency(c, "code");
      const name = getCurrency(c, "name");
      return {
        options: [
          ...(symbol !== code
            ? [
                {
                  name: t`Symbol` + ` ` + `(${symbol})`,
                  value: "symbol",
                },
              ]
            : []),
          {
            name: t`Code` + ` ` + `(${code})`,
            value: "code",
          },
          {
            name: t`Name` + ` ` + `(${name})`,
            value: "name",
          },
        ],
      };
    },
    getDefault: (column, settings) => {
      const c = settings["currency"] || "USD";
      return getCurrencySymbol(c) !== getCurrency(c, "code")
        ? "symbol"
        : "code";
    },
    getHidden: (column, settings) => settings["number_style"] !== "currency",
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
    getHidden: (column, settings, { series }) =>
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
        { name: "100’000.00", value: ".’" },
      ],
    },
    default: ".,",
  },
  decimals: {
    title: t`Minimum number of decimal places`,
    widget: "number",
    props: {
      placeholder: "1",
    },
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
    props: {
      placeholder: "$",
    },
  },
  suffix: {
    title: t`Add a suffix`,
    widget: "input",
    props: {
      placeholder: t`dollars`,
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
    getValue: (column, settings) => {
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

export function getSettingDefinitionsForColumn(series, column) {
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

export function isPivoted(series, settings) {
  const [{ data }] = series;

  if (!settings["table.pivot"]) {
    return false;
  }

  const pivotIndex = _.findIndex(
    data.cols,
    col => col.name === settings["table.pivot_column"],
  );
  const cellIndex = _.findIndex(
    data.cols,
    col => col.name === settings["table.cell_column"],
  );
  const normalIndex = _.findIndex(
    data.cols,
    (col, index) => index !== pivotIndex && index !== cellIndex,
  );

  return pivotIndex >= 0 && cellIndex >= 0 && normalIndex >= 0;
}

export const getTitleForColumn = (column, series, settings) => {
  const pivoted = isPivoted(series, settings);
  if (pivoted) {
    return formatColumn(column) || t`Unset`;
  } else {
    return (
      settings.column(column)["_column_title_full"] || formatColumn(column)
    );
  }
};

export const buildTableColumnSettings = ({
  getIsColumnVisible = col => col.visibility_type !== "details-only",
} = {}) => ({
  // NOTE: table column settings may be identified by fieldRef (possible not normalized) or column name:
  //   { name: "COLUMN_NAME", enabled: true }
  //   { fieldRef: ["field", 2, {"source-field": 1}], enabled: true }
  "table.columns": {
    section: t`Columns`,
    // title: t`Columns`,
    widget: ChartSettingTableColumns,
    getHidden: (series, vizSettings) => vizSettings["table.pivot"],
    isValid: ([{ card, data }]) => {
      const columns = card.visualization_settings["table.columns"];
      const enabledColumns = columns.filter(column => column.enabled);
      return _.all(
        enabledColumns,
        columnSetting =>
          findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
      );
    },
    getDefault: ([
      {
        data: { cols },
      },
    ]) =>
      cols.map(col => ({
        name: col.name,
        fieldRef: col.field_ref,
        enabled: getIsColumnVisible(col),
      })),
    getProps: (series, settings) => {
      const [
        {
          data: { cols },
        },
      ] = series;

      return {
        columns: cols,
        getColumnName: column => getTitleForColumn(column, series, settings),
      };
    },
  },
});
