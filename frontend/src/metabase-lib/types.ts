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

declare const OrderByClause: unique symbol;
export type OrderByClause = unknown & { _opaque: typeof OrderByClause };

export type OrderByDirection = "asc" | "desc";

export type Clause = OrderByClause;

declare const ColumnMetadata: unique symbol;
export type ColumnMetadata = unknown & { _opaque: typeof ColumnMetadata };

declare const ColumnGroup: unique symbol;
export type ColumnGroup = unknown & { _opaque: typeof ColumnGroup };

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
  fkReferenceName?: string;
  is_calculated: boolean;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  table?: TableInlineDisplayInfo;

  breakoutPosition?: number;
  orderByPosition?: number;
};

export type OrderByClauseDisplayInfo = Pick<
  ColumnDisplayInfo,
  "name" | "displayName" | "table"
> & {
  direction: OrderByDirection;
};

declare const FilterOperator: unique symbol;
export type FilterOperator = unknown & { _opaque: typeof FilterOperator };

declare const Join: unique symbol;
export type Join = unknown & { _opaque: typeof Join };

export type JoinStrategy =
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join";
