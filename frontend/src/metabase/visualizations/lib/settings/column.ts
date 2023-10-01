import { t } from "ttag";
import moment from "moment-timezone";
import _ from "underscore";

import type {
  DatasetColumn,
  DatetimeUnit,
  FieldReference,
  Series,
  VisualizationSettingId,
  VisualizationSettings,
} from "metabase-types/api";

import ChartNestedSettingColumns from "metabase/visualizations/components/settings/ChartNestedSettingColumns";
import { ChartSettingTableColumns } from "metabase/visualizations/components/settings/ChartSettingTableColumns";

// HACK: cyclical dependency causing errors in unit tests
// import { getVisualizationRaw } from "metabase/visualizations";
function getVisualizationRaw(...args: Series[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

type GetColumns = (
  series: Series,
  vizSettings: VisualizationSettings,
) => DatasetColumn[];

const DEFAULT_GET_COLUMNS: GetColumns = (
  series: Series,
  vizSettings: VisualizationSettings,
) => series.flatMap(s => s.data?.cols ?? []);

export function columnSettings({
  getColumns = DEFAULT_GET_COLUMNS,
  ...def
}: VisualizationSettingDefinition<Series> & {
  getColumns?: GetColumns;
}) {
  return nestedSettings<DatasetColumn>("column_settings", {
    section: t`Formatting`,
    objectName: "column",
    getObjects: getColumns,
    getObjectKey: getColumnKey,
    getSettingDefinitionsForObject: getSettingDefinitionsForColumn,
    component: ChartNestedSettingColumns,
    getInheritedSettingsForObject: getInheritedSettingsForColumn,
    useRawSeries: true,
    ...def,
  });
}

import MetabaseSettings from "metabase/lib/settings";
import type {
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import {
  isDate,
  isNumber,
  isCoordinate,
  isCurrency,
  isDateWithoutTime,
} from "metabase-lib/types/utils/isa";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import type Field from "metabase-lib/metadata/Field";
import { nestedSettings } from "./nested";

export function getGlobalSettingsForColumn(
  fieldOrColumn?: Field | DatasetColumn,
) {
  const columnSettings = {};
  const customFormatting = MetabaseSettings.get("custom-formatting") || {};

  // NOTE: the order of these doesn't matter as long as there's no overlap between settings
  for (const [, globalSettings] of Object.entries(customFormatting)) {
    Object.assign(columnSettings, globalSettings);
  }

  return columnSettings;
}

function getLocalSettingsForColumn(column: DatasetColumn) {
  return column.settings || {};
}

function getInheritedSettingsForColumn(column: DatasetColumn) {
  return {
    ...getGlobalSettingsForColumn(column),
    ...getLocalSettingsForColumn(column),
  };
}

const EXAMPLE_DATE = moment("2018-01-31 17:24");

function getDateStyleOptionsForUnit(
  unit?: DatetimeUnit,
  abbreviate = false,
  separator?: string,
) {
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

function dateStyleOption(
  style: string,
  unit?: DatetimeUnit,
  abbreviate = false,
  separator?: string,
) {
  let format = getDateFormatFromStyle(style, unit, separator);
  if (abbreviate) {
    format = format?.replace(/MMMM/, "MMM").replace(/dddd/, "ddd");
  }
  return {
    name: EXAMPLE_DATE.format(format),
    value: style,
  };
}

function timeStyleOption(style: string, description: string) {
  const format = style;
  return {
    name:
      EXAMPLE_DATE.format(format) + (description ? ` (${description})` : ``),
    value: style,
  };
}

type TimeUnit = DatetimeUnit | "second" | "millisecond";

function getTimeEnabledOptionsForUnit(unit?: TimeUnit) {
  const options: {
    name: string;
    value: VisualizationSettings["time_enabled"];
  }[] = [
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

export const DATE_COLUMN_SETTINGS: VisualizationSettingsDefinitions<DatasetColumn> =
  {
    date_style: {
      title: t`Date style`,
      widget: "select",
      getDefault: ({ unit }) => {
        // Grab the first option's value. If there were no options (for
        // hour-of-day probably), use an empty format string instead.
        const [{ value = "" } = {}] = getDateStyleOptionsForUnit(unit);
        return value;
      },
      isValid: ({ unit }, settings = {}) => {
        const options = getDateStyleOptionsForUnit(unit);
        return !!_.findWhere(options, { value: settings["date_style"] });
      },
      getProps: ({ unit }, settings = {}) => ({
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
      getProps: (column, { date_style } = {}) => {
        const style =
          date_style && /\//.test(date_style) ? date_style : "M/D/YYYY";
        return {
          options: [
            { name: style, value: "/" },
            { name: style.replace(/\//g, "-"), value: "-" },
            { name: style.replace(/\//g, "."), value: "." },
          ],
        };
      },
      getHidden: ({ unit }, settings = {}) =>
        !/\//.test(settings["date_style"] || ""),
    },
    date_abbreviate: {
      title: t`Abbreviate days and months`,
      widget: "toggle",
      default: false,
      inline: true,
      getHidden: ({ unit }, settings = {}) => {
        const format = getDateFormatFromStyle(settings["date_style"], unit);
        return !format?.match(/MMMM|dddd/);
      },
      readDependencies: ["date_style"],
    },
    time_enabled: {
      title: t`Show the time`,
      widget: "radio",
      isValid: ({ unit }, settings = {}) => {
        const options = getTimeEnabledOptionsForUnit(unit);
        return !!_.findWhere(options, { value: settings["time_enabled"] });
      },
      getProps: ({ unit }) => {
        const options = getTimeEnabledOptionsForUnit(unit);
        return { options };
      },
      getHidden: column => !hasHour(column.unit) || isDateWithoutTime(column),
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
      getHidden: (column, settings = {}) =>
        !settings["time_enabled"] || isDateWithoutTime(column),
      readDependencies: ["time_enabled"],
    },
  };

function getCurrency(currency?: string, currencyStyle?: string) {
  return (0)
    .toLocaleString("en", {
      style: "currency",
      currency: currency,
      currencyDisplay: currencyStyle,
    })
    .replace(/0([.,]0+)?/, "")
    .trim(); // strip off actual number
}

export const NUMBER_COLUMN_SETTINGS: VisualizationSettingsDefinitions<DatasetColumn> =
  {
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
      getDefault: (column, settings = {}) =>
        isCurrency(column) && settings["currency"] ? "currency" : "decimal",
      // hide this for currency
      getHidden: (column, settings = {}) =>
        isCurrency(column) && settings["number_style"] === "currency",
      readDependencies: ["currency"],
    },
    currency: {
      title: t`Unit of currency`,
      widget: "select",
      props: {
        // FIXME: rest of these options
        options: currency.map(([_, currency]: any) => ({
          name: currency.name,
          value: currency.code,
        })),
        searchProp: "name",
        searchCaseSensitive: false,
      },
      default: "USD",
      getHidden: (column, settings = {}) =>
        settings["number_style"] !== "currency",
    },
    currency_style: {
      title: t`Currency label style`,
      widget: "radio",
      getProps: (column, settings = {}) => {
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
      getDefault: (column, settings = {}) => {
        const c = settings["currency"] || "USD";
        return getCurrencySymbol(c) !== getCurrency(c, "code")
          ? "symbol"
          : "code";
      },
      getHidden: (column, settings = {}) =>
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
      getHidden: (column, settings = {}, { series } = {}) =>
        settings["number_style"] !== "currency" ||
        series?.[0].card.display !== "table",
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
        "currency_header_only" as VisualizationSettingId, // dead id?
      ],
    },
  };

const COMMON_COLUMN_SETTINGS: VisualizationSettingsDefinitions<DatasetColumn> =
  {
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

export function getSettingDefinitionsForColumn(
  series: Series,
  column: DatasetColumn,
) {
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

export function isPivoted(series: Series, settings: VisualizationSettings) {
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

export const getTitleForColumn = (
  column: DatasetColumn,
  series: Series,
  settings: VisualizationSettings,
) => {
  const pivoted = isPivoted(series, settings);
  if (pivoted) {
    return formatColumn(column) || t`Unset`;
  } else {
    return (
      settings.column?.(column)["_column_title_full"] || formatColumn(column)
    );
  }
};

export const buildTableColumnSettings = ({
  getIsColumnVisible = (col: DatasetColumn) =>
    col.visibility_type !== "details-only",
} = {}): VisualizationSettingsDefinitions<Series> => ({
  // NOTE: table column settings may be identified by fieldRef (possible not normalized) or column name:
  //   { name: "COLUMN_NAME", enabled: true }
  //   { fieldRef: ["field", 2, {"source-field": 1}], enabled: true }
  "table.columns": {
    section: t`Columns`,
    title: t`Columns`,
    widget: ChartSettingTableColumns,
    getHidden: (series, vizSettings) => vizSettings["table.pivot"] ?? false,
    isValid: ([{ card, data }]) => {
      const columns = card.visualization_settings["table.columns"] ?? [];
      const enabledColumns = columns.filter(column => column.enabled) ?? [];
      // If "table.columns" happened to be an empty array,
      // it will be treated as "all columns are hidden",
      // This check ensures it's not empty,
      // otherwise it will be overwritten by `getDefault` below
      return (
        columns.length !== 0 &&
        _.all(
          enabledColumns,
          columnSetting =>
            findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
        )
      );
    },
    getDefault: ([
      {
        data: { cols },
      },
    ]) =>
      cols.map(col => ({
        name: col.name,
        fieldRef: col.field_ref as FieldReference,
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
        getColumnName: (column: DatasetColumn) =>
          getTitleForColumn(column, series, settings),
      };
    },
  },
});
