/**
 * An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
 * and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
 */
declare const Query: unique symbol;
export type Query = unknown & { _opaque: typeof Query };

declare const MetadataProvider: unique symbol;
export type MetadataProvider = unknown & { _opaque: typeof MetadataProvider };

declare const TableMetadata: unique symbol;
export type TableMetadata = unknown & { _opaque: typeof TableMetadata };

declare const CardMetadata: unique symbol;
export type CardMetadata = unknown & { _opaque: typeof CardMetadata };

export type Limit = number | null;

declare const BreakoutClause: unique symbol;
export type BreakoutClause = unknown & { _opaque: typeof BreakoutClause };

declare const OrderByClause: unique symbol;
export type OrderByClause = unknown & { _opaque: typeof OrderByClause };

export type OrderByDirection = "asc" | "desc";

declare const FilterClause: unique symbol;
export type FilterClause = unknown & { _opaque: typeof FilterClause };

export type Clause = BreakoutClause | OrderByClause | FilterClause;

declare const ColumnMetadata: unique symbol;
export type ColumnMetadata = unknown & { _opaque: typeof ColumnMetadata };

declare const ColumnWithOperators: unique symbol;
export type ColumnWithOperators = unknown & {
  _opaque: typeof ColumnWithOperators;
};

declare const ColumnGroup: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroup };

declare const Bucket: unique symbol;
export type Bucket = unknown & { _opaque: typeof Bucket };

declare const BooleanExpression: unique symbol;
export type BooleanExpression = unknown & { _opaque: typeof BooleanExpression };

export type TableDisplayInfo = {
  name: string;
  displayName: string;
  isSourceTable: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
};

type TableInlineDisplayInfo = Pick<
  TableDisplayInfo,
  "name" | "displayName" | "isSourceTable"
>;

export type ColumnDisplayInfo = {
  name: string;
  displayName: string;
  longDisplayName: string;

  fkReferenceName?: string;
  isCalculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  table?: TableInlineDisplayInfo;

  breakoutPosition?: number;
  orderByPosition?: number;
};

export type ClauseDisplayInfo = Pick<
  ColumnDisplayInfo,
  "name" | "displayName" | "longDisplayName" | "table"
>;

export type BreakoutClauseDisplayInfo = ClauseDisplayInfo;

export type BucketDisplayInfo = {
  displayName: string;
  default?: boolean;
  selected?: boolean;
};

export type OrderByClauseDisplayInfo = ClauseDisplayInfo & {
  direction: OrderByDirection;
};

declare const FilterOperator: unique symbol;
export type FilterOperator = unknown & { _opaque: typeof FilterOperator };

// ExternalOp is a JS-friendly representation of a filter clause or aggregation clause.
//
// TODO: ExternalOp is not actually supposed to be opaque at all, the whole point of it is for FE friendliness... we
// should write a real signature here. See https://metaboat.slack.com/archives/C04CYTEL9N2/p1686948727809349 where I
// was soliciting feedback on what the signature should be. -- Cam
declare const ExternalOp: unique symbol;
export type ExternalOp = unknown & { _opaque: typeof ExternalOp };

declare const Join: unique symbol;
export type Join = unknown & { _opaque: typeof Join };

export type JoinStrategy =
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join";

export type ExpressionArg =
  | boolean
  | number
  | string
  | ColumnMetadata
  | ExternalOp;
