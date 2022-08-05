import { ISO8601Time } from ".";
import { FieldId } from "./Field";
import { DatasetQuery } from "./Card";
import { DatetimeUnit, FieldLiteral, Field } from "./Query";

export type ColumnName = string;

export type ColumnSettings = { [id: string]: any };

export type BinningInfo = {
  bin_width: number;
};

// TODO: incomplete
export type Column = {
  id?: FieldId | FieldLiteral; // NOTE: sometimes id is a field reference, e.g. nested queries
  name: ColumnName;
  display_name: string;
  base_type: string;
  effective_type: string;
  semantic_type?: string;
  source?: "fields" | "aggregation" | "breakout";
  unit?: DatetimeUnit;
  binning_info?: BinningInfo;
  fk_field_id?: FieldId;
  expression_name?: any;
  settings?: ColumnSettings;
  field_ref?: Field;
};

export type Value =
  | string
  | number
  | ISO8601Time
  | boolean
  | null
  | Record<string, unknown>;
export type Row = Value[];

export type DatasetData = {
  cols: Column[];
  rows: Row[];
  rows_truncated?: number;
  requested_timezone?: string;
  results_timezone?: string;
};

export type Dataset = {
  data: DatasetData;
  json_query: DatasetQuery;
  error?: string;
};
