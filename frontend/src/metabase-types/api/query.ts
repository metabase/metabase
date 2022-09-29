import { DatabaseId } from "./database";
import { TableId } from "./table";

export interface StructuredQuery {
  "source-table"?: TableId;
}

export interface NativeQuery {
  query: string;
}

export interface StructuredDatasetQuery {
  type: "query";
  database: DatabaseId;
  query: StructuredQuery;
}

export interface NativeDatasetQuery {
  type: "native";
  database: DatabaseId;
  native: NativeQuery;
}

export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;

export type DatetimeUnit =
  | "default"
  | "minute"
  | "minute-of-hour"
  | "hour"
  | "hour-of-day"
  | "day"
  | "day-of-week"
  | "day-of-month"
  | "day-of-year"
  | "week"
  | "week-of-year"
  | "month"
  | "month-of-year"
  | "quarter"
  | "quarter-of-year"
  | "year";
