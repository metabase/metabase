/**
 * Builders for MBQL 5 clauses, as the JSON `POST /api/dataset` reads. Every
 * clause is `[tag, options, ...args]` and gets a fresh `lib/uuid`. Columns of
 * earlier stages are referenced by name, so each reference states its type.
 */
import { uuid } from "metabase/utils/uuid";

const BASE_TYPES = [
  "type/Text",
  "type/Integer",
  "type/Float",
  "type/Number",
  "type/Boolean",
  "type/DateTime",
  "type/UUID",
] as const;

export type BaseType = (typeof BASE_TYPES)[number];

const isBaseType = (value: unknown): value is BaseType =>
  BASE_TYPES.some((baseType) => baseType === value);

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

/** `clause` again, with a uuid of its own: a clause can't appear twice in a query. */
export const copyOf = (clause_: Clause): Clause => {
  const [tag, opts, ...args] = clause_;
  return [tag, { ...opts, "lib/uuid": uuid() }, ...args];
};

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

export type FrameBound =
  | "unbounded-preceding"
  | "current-row"
  | "unbounded-following"
  | readonly ["preceding" | "following", number];

/** Which rows around the current one a window function reads. */
export interface Frame {
  mode: "rows";
  start: FrameBound;
  end: FrameBound;
}

/**
 * `fn OVER (PARTITION BY … ORDER BY … ROWS BETWEEN …)`. Only in the
 * expressions of a stage with no aggregation or breakout.
 */
export const window = (
  fn: Clause,
  {
    partitionBy = [],
    orderBy = [],
    frame,
  }: { partitionBy?: Expr[]; orderBy?: Clause[]; frame?: Frame } = {},
): Clause => [
  "window",
  options(frame !== undefined ? { frame } : {}),
  fn,
  clause("partition-by", ...partitionBy),
  clause("order-by", ...orderBy),
];

/** `x` rounded to 4 decimal places, as the string planners round shares. */
export const round4 = (x: Clause): Clause =>
  clause("/", clause("round", clause("*", x, 10000)), 10000);

const isClause = (arg: Arg): arg is Clause =>
  Array.isArray(arg) && typeof arg[0] === "string";

const literalType = (literal: Literal): BaseType | undefined => {
  switch (typeof literal) {
    case "string":
      return "type/Text";
    case "number":
      return Number.isInteger(literal) ? "type/Integer" : "type/Float";
    case "boolean":
      return "type/Boolean";
    default:
      return undefined;
  }
};

const INTEGER_TAGS = new Set([
  "count",
  "count-where",
  "distinct",
  "distinct-where",
  "row-number",
  "datetime-diff",
  "round",
]);
const BOOLEAN_TAGS = new Set([
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "and",
  "or",
  "not",
  "is-null",
  "not-null",
  "between",
]);
const FIRST_ARGUMENT_TAGS = new Set([
  "min",
  "max",
  "sum",
  "sum-where",
  "lag",
  "lead",
  "coalesce",
  "window",
]);

/**
 * The type of the column an expression or aggregation makes, for the clauses
 * the planners use. `undefined` when it can't tell: state the type instead.
 */
export const typeOf = (arg: Arg): BaseType | undefined => {
  if (arg === null || typeof arg !== "object") {
    return literalType(arg);
  }
  if (!isClause(arg)) {
    return undefined;
  }
  const [tag, opts, ...args] = arg;
  const stated = opts["base-type"];
  if (isBaseType(stated)) {
    return args.length > 0 &&
      tag !== "field" &&
      tag !== "expression" &&
      tag !== "value"
      ? undefined
      : stated;
  }
  if (INTEGER_TAGS.has(tag)) {
    return "type/Integer";
  }
  if (BOOLEAN_TAGS.has(tag)) {
    return "type/Boolean";
  }
  if (FIRST_ARGUMENT_TAGS.has(tag)) {
    return args[0] !== undefined ? typeOf(args[0]) : undefined;
  }
  switch (tag) {
    case "/":
    case "median":
    case "avg":
      return "type/Float";
    case "+":
    case "-":
    case "*": {
      const types = args.map(typeOf);
      return types.includes("type/Float") ? "type/Float" : types.find(Boolean);
    }
    case "datetime-add":
    case "datetime-subtract":
      return "type/DateTime";
    case "text":
    case "concat":
      return "type/Text";
    case "case": {
      const [branches, fallback] = args;
      const firstValue =
        branches !== undefined && Array.isArray(branches) && !isClause(branches)
          ? branches[0]?.[1]
          : undefined;
      return (
        (firstValue !== undefined ? typeOf(firstValue) : undefined) ??
        (fallback !== undefined ? typeOf(fallback) : undefined)
      );
    }
    default:
      return undefined;
  }
};
