/* @flow */

import type { ISO8601Time } from ".";
import type { FieldId } from "./Field";
import type { DatasetQuery } from "./Card";
import type { DatetimeUnit, FieldLiteral } from "./Query";

export type ColumnName = string;

export type ColumnSettings = { [id: string]: any };

export type BinningInfo = {
  bin_width: number,
};

// TODO: incomplete
export type Column = {
  id: ?(FieldId | FieldLiteral), // NOTE: sometimes id is a field reference, e.x. nested queries?
  name: ColumnName,
  display_name: string,
  base_type: string,
  special_type: ?string,
  source?: "fields" | "aggregation" | "breakout",
  unit?: DatetimeUnit,
  binning_info?: BinningInfo,
  fk_field_id?: FieldId,
  expression_name?: any,
  settings?: ColumnSettings,
};

export type Value = string | number | ISO8601Time | boolean | null | {};
export type Row = Value[];

export type DatasetData = {
  cols: Column[],
  columns: ColumnName[],
  rows: Row[],
};

export type Dataset = {
  data: DatasetData,
  json_query: DatasetQuery,
};
