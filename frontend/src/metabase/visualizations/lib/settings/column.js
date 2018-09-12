import React from "react";

import { getComputedSettings, getSettingsWidgets } from "../settings";

import {
  fieldRefForColumn,
  findColumnForColumnSetting,
  keyForColumn,
} from "metabase/lib/dataset";

import { t } from "c-3po";

import ChartSettingColumnSettings from "metabase/visualizations/components/settings/ChartSettingColumnSettings";

import { isDate, isNumber } from "metabase/lib/schema_metadata";

export const COLUMN_SETTINGS = {
  column_settings: {
    section: t`Formatting`,
    widget: ChartSettingColumnSettings,
    getDefault: () => ({}),
    getProps: (series, vizSettings) => ({
      series,
      settings: vizSettings,
      columns: [].concat(...series.map(s => s.data.cols)),
    }),
    useRawSeries: true,
  },
  // HACK: adds a "column" function to settings to get column-level settings that should be passed to formatValue
  column: {
    getDefault(series, vizSettings) {
      const columnSettings = vizSettings["column_settings"];
      const cache = new Map();
      return column => {
        const key = keyForColumn(column);
        if (!cache.has(key)) {
          const columnSettingsWithColumn = columnSettings[key]
            ? { column, ...columnSettings[key] }
            : { column };
          cache.set(key, columnSettingsWithColumn);
        }
        return cache.get(key);
      };
    },
    readDependencies: ["column_settings"],
  },
};

export const DATE_COLUMN_SETTINGS = {
  date_style: {
    title: t`Date style`,
    widget: "radio",
    getProps: (column, settings) => ({
      options: [
        { name: t`1/7/18 (month, day, year)`, value: null },
        { name: t`7/1/18 (day, month, year)`, value: null },
      ],
    }),
  },
  date_abbreviate: {
    title: t`Abbreviate names of days and months`,
    widget: "toggle",
    default: false,
  },
  show_time: {
    title: t`Show the time`,
    widget: "toggle",
    default: true,
  },
  time_style: {
    title: t`Date style`,
    widget: "radio",
    getProps: (column, settings) => ({
      options: [
        { name: t`5:24 PM (12-hour clock)`, value: null },
        { name: t`17:24 PM (24-hour clock)`, value: null },
      ],
    }),
    getHidden: (column, settings) => !!settings["show_time"],
  },
};

export const NUMBER_COLUMN_SETTINGS = {
  locale: {
    title: t`Separator style`,
    widget: "select",
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
  prefix: {
    title: t`Add a prefix`,
    widget: "input",
  },
  suffix: {
    title: t`Add a suffix`,
    widget: "input",
  },
  scale: {
    title: t`Multiply by a number`,
    widget: "number",
  },
};

export function getSettingDefintionsForColumn(column) {
  if (isDate(column)) {
    return DATE_COLUMN_SETTINGS;
  } else if (isNumber(column)) {
    return NUMBER_COLUMN_SETTINGS;
  } else {
    return {};
  }
}

export function getComputedSettingsForColumn(column, storedSettings) {
  const settingsDefs = getSettingDefintionsForColumn(column);
  return getComputedSettings(settingsDefs, column, storedSettings);
}

export function getSettingsWidgetsForColumm(
  column,
  storedSettings,
  onChangeSettings,
) {
  const settingsDefs = getSettingDefintionsForColumn(column);
  const computedSettings = getComputedSettingsForColumn(column, storedSettings);
  const widgets = getSettingsWidgets(
    settingsDefs,
    computedSettings,
    column,
    onChangeSettings,
  );
  return widgets;
}
