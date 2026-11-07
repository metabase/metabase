import type { CardId } from "./card";
import type { DatabaseId } from "./database";
import type { TemplateTag, TemplateTags, TemporalUnit } from "./dataset";
import type { FieldId } from "./field";
import type { MeasureId } from "./measure";
import type { MetricId } from "./metric";
import type { SegmentId } from "./segment";
import type { TableId } from "./table";

export type DatasetQuery = OpaqueDatasetQuery | LegacyDatasetQuery;

declare const LegacyDatasetQuerySymbol: unique symbol;
export type LegacyDatasetQuery = unknown & {
  database: DatabaseId | null;
  _opaque: typeof LegacyDatasetQuerySymbol;
};

// Audit-only query shape accepted by /api/dataset.
// `fn` names a backend function.
export interface InternalDatasetQuery {
  type: "internal";
  fn: string;
  args: string[];
  limit?: number;
  offset?: number;
}

declare const OpaqueDatasetQuerySymbol: unique symbol;
export type OpaqueDatasetQuery = unknown & {
  // TODO (AlexP 10/09/25) -- replace usages of this field with Lib.databaseID and drop it from here
  database: DatabaseId | null;
  _opaque: typeof OpaqueDatasetQuerySymbol;
};

interface PublicStructuredDatasetQuery {
  type: "query";
}

interface PublicNativeDatasetQuery {
  type: "native";
  native: {
    "template-tags"?: TemplateTags;
  };
}

export type LegacyPublicDatasetQuery =
  | PublicStructuredDatasetQuery
  | PublicNativeDatasetQuery;

export type PublicDatasetQuery = OpaqueDatasetQuery | LegacyPublicDatasetQuery;

export const dateTimeAbsoluteUnits = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export const dateTimeRelativeUnits = [
  "minute-of-hour",
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
] as const;

export const dateTimeUnits = [
  ...dateTimeAbsoluteUnits,
  ...dateTimeRelativeUnits,
] as const;

export type DateTimeAbsoluteUnit = (typeof dateTimeAbsoluteUnits)[number];
export type DateTimeRelativeUnit = (typeof dateTimeRelativeUnits)[number];
export type DatetimeUnit =
  | "default"
  | DateTimeAbsoluteUnit
  | DateTimeRelativeUnit;

export interface ReferenceOptions {
  binning?: BinningOptions;
  "temporal-unit"?: DatetimeUnit;
  "join-alias"?: string;
  "base-type"?: string;
  "source-field"?: number;
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

type ExpressionName = string;

export type StringLiteral = string;
export type NumericLiteral = number | bigint;
export type BooleanLiteral = boolean;
export type DatetimeLiteral = string;

export type JoinConditionOperator = "=" | "!=" | ">" | "<" | ">=" | "<=";

export type JoinStrategy =
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join";

export type FieldReference = ConcreteFieldReference | AggregateFieldReference;

export type ConcreteFieldReference =
  | LocalFieldReference
  | FieldLiteral
  | ForeignFieldReference
  | JoinedFieldReference
  | ExpressionReference
  | DatetimeField
  | BinnedField;

export type LocalFieldReference = ["field", FieldId, ReferenceOptions | null];

export type ForeignFieldReference = [
  "field",
  FieldId | string,
  ReferenceOptions & { "source-field": FieldId | string },
];

export type ExpressionReference = [
  "expression",
  ExpressionName,
  (ReferenceOptions | null)?,
];

export type FieldLiteral = [
  "field",
  string,
  ReferenceOptions & { "base-type": string },
];

export type JoinedFieldReference = [
  "field",
  FieldId | string,
  ReferenceOptions & { "join-alias": string },
];

type DatetimeField = [
  "field",
  FieldId | string,
  Omit<ReferenceOptions, "binning"> & { "temporal-unit": DatetimeUnit },
];

export type BinnedField = [
  "field",
  FieldId | string,
  Omit<ReferenceOptions, "temporal-unit"> & {
    binning: BinningOptions;
  },
];

export type AggregateFieldReference =
  | ["aggregation", number, ReferenceOptions | null]
  | ["aggregation", number];

export type TagName = string;
export type TemplateTagReference = ["template-tag", TagName];

export type DimensionReferenceWithOptions =
  | FieldReference
  | ExpressionReference
  | AggregateFieldReference;

export type DimensionReference =
  | DimensionReferenceWithOptions
  | TemplateTagReference;

export type TestTableSourceSpec = {
  type: "table";
  id: TableId;
};

export type TestCardSourceSpec = {
  type: "card";
  id: CardId;
};

export type TestSourceSpec = TestTableSourceSpec | TestCardSourceSpec;

export type TestColumnSpec = {
  type: "column";
  name?: string;
  fieldId?: FieldId;
  joinAlias?: string;
  sourceFieldId?: FieldId;
  sourceFieldJoinAlias?: string;
};

export type TestExpressionSpec =
  | TestLiteralSpec
  | TestOperatorSpec
  | TestColumnSpec;

export type TestSegmentSpec = {
  type: "segment";
  id: SegmentId;
};

export type TestMeasureSpec = {
  type: "measure";
  id: MeasureId;
};

export type TestMetricSpec = {
  type: "metric";
  id: MetricId;
};

export type TestFilterSpec = TestExpressionSpec | TestSegmentSpec;

export type TestOperatorArgSpec =
  | TestExpressionSpec
  | TestSegmentSpec
  | TestMeasureSpec
  | TestMetricSpec;

export type TestNamedAggregationSpec = {
  name: string;
  value: TestExpressionSpec | TestMeasureSpec | TestMetricSpec;
};

export type TestAggregationSpec =
  | TestExpressionSpec
  | TestNamedAggregationSpec
  | TestMeasureSpec
  | TestMetricSpec;

export type TestNamedExpressionSpec = {
  name: string;
  value: TestExpressionSpec;
};

export type TestLiteralSpec = {
  type: "literal";
  value: NumericLiteral | StringLiteral | BooleanLiteral | DatetimeLiteral;
};

export type TestOperatorSpec = {
  type: "operator";
  operator: string;
  args?: readonly TestOperatorArgSpec[];

  // For an aggregation: the name of its result column, which a later stage
  // refers to.
  name?: string;
};

export type TestTemporalBucketSpec = {
  unit?: TemporalUnit;
};

export type TestDefaultBinningSpec = {
  strategy: "default";
};

export type TestNumBinsBinningSpec = {
  strategy: "num-bins";
  numBins: number;
};

export type TestBinWidthBinningSpec = {
  strategy: "bin-width";
  binWidth: number;
};

export type TestBinningSpec =
  | TestDefaultBinningSpec
  | TestNumBinsBinningSpec
  | TestBinWidthBinningSpec;

type TestBucketSpec = TestTemporalBucketSpec & {
  binning?: TestBinningSpec;
};

export type TestColumnWithBinningSpec = TestColumnSpec & TestBucketSpec;

export type TestBreakoutWithNameSpec = {
  type: "breakout";
  name: string;
  column: TestColumnWithBinningSpec;
};

export type TestBreakoutSpec =
  | TestColumnWithBinningSpec
  | TestBreakoutWithNameSpec;

export type TestJoinSpec = {
  source: TestSourceSpec;
  strategy: JoinStrategy;
  alias?: string;

  // If not set we will use the suggested join conditions
  conditions?: TestJoinConditionSpec[];
};

type TestJoinConditionSpec = {
  operator: JoinConditionOperator;
  left: TestColumnWithBinningSpec | TestExpressionSpec;
  right: TestColumnWithBinningSpec | TestExpressionSpec;
};

export type TestOrderBySpec = TestColumnSpec & {
  direction?: "asc" | "desc";
} & TestBucketSpec;

export type TestStageSpec = {
  fields?: readonly TestColumnSpec[];
  expressions?: readonly TestNamedExpressionSpec[];
  joins?: readonly TestJoinSpec[];
  filters?: readonly TestFilterSpec[];
  aggregations?: readonly TestAggregationSpec[];
  breakouts?: readonly TestBreakoutSpec[];
  orderBys?: readonly TestOrderBySpec[];
  limit?: number;
};

export type TestStageWithSourceSpec = TestStageSpec & {
  source: TestSourceSpec;
};

export type TestQuerySpec = {
  stages: [TestStageWithSourceSpec, ...TestStageSpec[]];
};

export type TestQuerySpecWithDatabase = TestQuerySpec & {
  database: DatabaseId;
};

export type TestTemplateTag = Pick<TemplateTag, "type"> &
  Partial<Omit<TemplateTag, "dimension" | "type">> & {
    dimension?: TableId;
  };

export type TestTemplateTags = Record<string, TestTemplateTag>;

export type TestNativeQuerySpec = {
  query: string;
  templateTags?: TestTemplateTags;
};

export type TestNativeQuerySpecWithDatabase = TestNativeQuerySpec & {
  database: DatabaseId;
};
