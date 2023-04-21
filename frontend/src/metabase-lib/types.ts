/**
 * An "opaque type": this technique gives us a way to pass around opaque CLJS values that TS will track for us,
 * and in other files it gets treated like `unknown` so it can't be examined, manipulated or a new one created.
 */
declare const Query: unique symbol;
export type Query = unknown & { _opaque: typeof Query };

declare const MetadataProvider: unique symbol;
export type MetadataProvider = unknown & { _opaque: typeof MetadataProvider };

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
  display_name: string;
  is_source_table: boolean;
  is_from_join: boolean;
  is_implicitly_joinable: boolean;
};

type TableInlineDisplayInfo = Pick<
  TableDisplayInfo,
  "name" | "display_name" | "is_source_table"
>;

export type ColumnDisplayInfo = {
  name: string;
  display_name: string;
  fk_reference_name?: string;
  semantic_type?: string | null;
  effective_type: string;
  is_calculated: boolean;
  is_from_join: boolean;
  is_implicitly_joinable: boolean;
  table?: TableInlineDisplayInfo;
};

export type OrderByClauseDisplayInfo = Pick<
  ColumnDisplayInfo,
  "name" | "display_name" | "effective_type" | "semantic_type" | "table"
> & {
  direction: OrderByDirection;
};
