import { t } from "ttag";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, Series } from "metabase-types/api";

import { getDefaultRowColumn, getDefaultValueColumns } from "./utils";

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
}; 