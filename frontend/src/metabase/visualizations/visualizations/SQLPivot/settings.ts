import { t } from "ttag";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, Series } from "metabase-types/api";

import { getDefaultRowColumn, getDefaultValueColumns, getDefaultColumnDimension } from "./utils";

export const SQL_PIVOT_SETTINGS = {
  "sqlpivot.row_column": {
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Row dimension`;
    },
    get description() {
      return t`Choose the column to use as row headers`;
    },
    widget: "select",
    getDefault: ([{ data }]: Series) => {
      return getDefaultRowColumn(data.cols);
    },
    getProps: ([{ data }]: Series) => ({
      options: data.cols
        .filter((col: DatasetColumn) => isString(col))
        .map((col: DatasetColumn) => getOptionFromColumn(col)),
    }),
    useRawSeries: true,
  },

  "sqlpivot.column_dimension": {
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Column dimension`;
    },
    get description() {
      return t`Choose the column to spread across columns (for matrix view)`;
    },
    widget: "select",
    getDefault: ([{ data }]: Series) => {
      return getDefaultColumnDimension(data.cols);
    },
    getProps: ([{ data }]: Series) => ({
      options: [
        { name: t`None`, value: null },
        ...data.cols
          .filter((col: DatasetColumn) => isString(col))
          .map((col: DatasetColumn) => getOptionFromColumn(col)),
      ],
    }),
    useRawSeries: true,
  },

  "sqlpivot.value_columns": {
    get section() {
      return t`Data`;
    },
    get title() {
      return t`Value columns`;
    },
    get description() {
      return t`Choose the columns to use as values in the pivot`;
    },
    widget: "select",
    props: {
      multi: true,
    },
    getDefault: ([{ data }]: Series) => {
      return getDefaultValueColumns(data.cols);
    },
    getProps: ([{ data }]: Series) => ({
      options: data.cols
        .filter((col: DatasetColumn) => isNumber(col))
        .map((col: DatasetColumn) => getOptionFromColumn(col)),
    }),
    useRawSeries: true,
  },

  "sqlpivot.transpose": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Transpose layout`;
    },
    get description() {
      return t`Switch rows and columns in the pivot table`;
    },
    widget: "toggle",
    inline: true,
    default: false,
  },

  "sqlpivot.show_row_aggregation": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Show row aggregation`;
    },
    get description() {
      return t`Add a column showing the average score for each row`;
    },
    widget: "toggle",
    inline: true,
    default: false,
    getHidden: (series: any, settings: any) => {
      return !settings["sqlpivot.column_dimension"];
    },
  },

  "sqlpivot.show_column_aggregation": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Show column aggregation`;
    },
    get description() {
      return t`Add a row showing the average score for each column`;
    },
    widget: "toggle",
    inline: true,
    default: false,
    getHidden: (series: any, settings: any) => {
      return !settings["sqlpivot.column_dimension"];
    },
  },
}; 