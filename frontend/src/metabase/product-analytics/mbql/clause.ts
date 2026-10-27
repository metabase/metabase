/**
 * Builders for MBQL 5 clauses, as the JSON `POST /api/dataset` reads. Every
 * clause is `[tag, options, ...args]` and gets a fresh `lib/uuid`. Columns of
 * earlier stages are referenced by name, so each reference states its type.
 */
import { uuid } from "metabase/utils/uuid";

export type BaseType =
  | "type/Text"
  | "type/Integer"
  | "type/Float"
  | "type/Number"
  | "type/Boolean"
  | "type/DateTime"
  | "type/UUID";

export type TemporalUnit = "minute" | "hour" | "day" | "week" | "month";

export type ClauseOptions = Readonly<Record<string, unknown>>;

export type Literal = string | number | boolean | null;

/** `:case`'s branches: condition and value pairs. */
export type CaseBranches = readonly (readonly [Expr, Expr])[];

export type Arg = Expr | CaseBranches;

export type Clause = readonly [string, ClauseOptions, ...Arg[]];

export type Expr = Clause | Literal;

const options = (extra: Record<string, unknown> = {}): ClauseOptions => ({
  "lib/uuid": uuid(),
  ...extra,
});

/** Any clause without options of its own, such as `clause("=", a, b)`. */
export const clause = (tag: string, ...args: Arg[]): Clause => [
  tag,
  options(),
  ...args,
];

/** A column of the stage's source, or of the join called `joinAlias`. */
export const field = (
  name: string,
  baseType: BaseType,
  joinAlias?: string,
): Clause => [
  "field",
  options({
    "base-type": baseType,
    ...(joinAlias !== undefined ? { "join-alias": joinAlias } : {}),
  }),
  name,
];

/** A datetime column truncated to `unit`. */
export const bucketed = (
  name: string,
  unit: TemporalUnit,
  joinAlias?: string,
): Clause => {
  const [tag, opts, ...args] = field(name, "type/DateTime", joinAlias);
  return [tag, { ...opts, "temporal-unit": unit }, ...args];
};

/** Names an expression, for a stage's `expressions`. */
export const expression = (name: string, expr: Clause): Clause => {
  const [tag, opts, ...args] = expr;
  return [tag, { ...opts, "lib/expression-name": name }, ...args];
};

/** A reference to an expression of the same stage. */
export const expressionRef = (name: string, baseType: BaseType): Clause => [
  "expression",
  options({ "base-type": baseType }),
  name,
];

/** Names an aggregation; the name is its column name in the next stage. */
export const aggregation = (name: string, agg: Clause): Clause => {
  const [tag, opts, ...args] = agg;
  return [tag, { ...opts, name, "display-name": name }, ...args];
};

/** A literal in a position that needs a clause, such as an expression. */
export const value = (literal: Literal, baseType: BaseType): Clause => [
  "value",
  options({ "base-type": baseType, "effective-type": baseType }),
  literal,
];

export const and = (...conditions: Clause[]): Clause | undefined =>
  conditions.length <= 1 ? conditions[0] : clause("and", ...conditions);

export const or = (...conditions: Clause[]): Clause | undefined =>
  conditions.length <= 1 ? conditions[0] : clause("or", ...conditions);

export const eq = (left: Expr, right: Expr): Clause => clause("=", left, right);

/** `CASE WHEN … THEN … END`, with an optional `ELSE`. */
export const caseWhen = (branches: CaseBranches, fallback?: Expr): Clause =>
  fallback === undefined
    ? clause("case", branches)
    : clause("case", branches, fallback);

export const asc = (expr: Expr): Clause => clause("asc", expr);
export const desc = (expr: Expr): Clause => clause("desc", expr);
