import type { TemplateTags } from "../types/Query";
import type { DatabaseId } from "./database";
import type { FieldId } from "./field";
import type { TableId } from "./table";

export interface StructuredQuery {
  "source-table"?: TableId;
}

export interface NativeQuery {
  query: string;
  "template-tags"?: TemplateTags;
  collection?: string;
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

export interface ReferenceOptions {
  binning?: BinningOptions;
  "temporal-unit"?: DatetimeUnit;
  "join-alias"?: string;
  "base-type"?: string;
}

type BinningOptions =
  | DefaultBinningOptions
  | NumBinsBinningOptions
  | BinWidthBinningOptions;

interface DefaultBinningOptions {
  strategy: "default";
}

interface NumBinsBinningOptions {
  strategy: "num-bins";
  "num-bins": number;
}

interface BinWidthBinningOptions {
  strategy: "bin-width";
  "bin-width": number;
}

export type ReferenceOptionsKeys =
  | "source-field"
  | "base-type"
  | "join-alias"
  | "temporal-unit"
  | "binning";

export type ColumnName = string;
export type FieldReference = [
  "field",
  FieldId | ColumnName,
  ReferenceOptions | null,
];

export type ExpressionName = string;
export type ExpressionReference = [
  "expression",
  ExpressionName,
  ReferenceOptions | null,
];

export type AggregationIndex = number;
export type AggregationReference = [
  "aggregation",
  AggregationIndex,
  ReferenceOptions | null,
];

export type TagName = string;
export type TemplateTagReference = ["template-tag", TagName];

export type DimensionReferenceWithOptions =
  | FieldReference
  | ExpressionReference
  | AggregationReference;

export type DimensionReference =
  | DimensionReferenceWithOptions
  | TemplateTagReference;
