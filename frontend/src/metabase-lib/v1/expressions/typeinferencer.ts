import type { Expression, FieldReference } from "metabase-types/api";

import { MBQL_CLAUSES } from "./config";
import {
  isCaseOrIf,
  isDimension,
  isFunction,
  isOffset,
  isOptionsObject,
} from "./matchers";
import { OPERATOR as OP } from "./tokenizer";

export const MONOTYPE = {
  Undefined: "undefined",
  Number: "number",
  String: "string",
  Boolean: "boolean",
  DateTime: "datetime",
};

export function infer(
  mbql: Expression,
  env: (ref: FieldReference) => string,
): string {
  if (!Array.isArray(mbql)) {
    return typeof mbql;
  }

  const op = mbql[0];
  switch (op) {
    case OP.Plus:
    case OP.Minus:
    case OP.Star:
    case OP.Slash:
      return MONOTYPE.Number;

    case OP.Not:
    case OP.And:
    case OP.Or:
    case OP.Equal:
    case OP.NotEqual:
    case OP.GreaterThan:
    case OP.GreaterThanEqual:
    case OP.LessThan:
    case OP.LessThanEqual:
      return MONOTYPE.Boolean;
  }

  if (isCaseOrIf(mbql)) {
    return infer(mbql[1][0][1], env);
  }
  if (isOffset(mbql)) {
    return infer(mbql[2], env);
  }

  if (isFunction(mbql) && op === "coalesce") {
    const [, ...args] = mbql;
    const expressionArgs = args.filter(
      (arg): arg is Expression => !isOptionsObject(arg),
    );
    return infer(expressionArgs[0], env);
  }

  const func = MBQL_CLAUSES[op];
  if (func) {
    const returnType = func.type;
    switch (returnType) {
      case "aggregation":
        return MONOTYPE.Number;
      case "any":
        return MONOTYPE.Undefined;
      case "boolean":
        return MONOTYPE.Boolean;
      case "datetime":
        return MONOTYPE.DateTime;
      case "string":
        return MONOTYPE.String;
      default:
        return returnType;
    }
  }

  if (isDimension(mbql) && op === "field" && env) {
    return env(mbql);
  }

  return MONOTYPE.Undefined;
}
