export type ReferenceOptionsKeys =
  | "source-field"
  | "base-type"
  | "join-alias"
  | "temporal-unit"
  | "binning";

export type ReferenceOptions = Partial<
  Record<ReferenceOptionsKeys, any>
> | null;

export type FieldId = number;
export type ColumnName = string;
export type FieldReference = ["field", FieldId | ColumnName, ReferenceOptions];

export type ExpressionName = string;
export type ExpressionReference = [
  "expression",
  ExpressionName,
  ReferenceOptions,
];

export type AggregationIndex = number;
export type AggregationReference = [
  "aggregation",
  AggregationIndex,
  ReferenceOptions,
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
