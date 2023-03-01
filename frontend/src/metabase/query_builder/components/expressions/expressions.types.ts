import { Expression, Field } from "metabase-types/types/Query";

type ExpressionConfig = Expression | Field | Array<any>; // TODO: add proper types for all kinds of expressions

export type ExpressionValue = number | string | ExpressionConfig;
