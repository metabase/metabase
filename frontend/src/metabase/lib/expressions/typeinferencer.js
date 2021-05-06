import { MBQL_CLAUSES } from "./config";
import { OPERATOR as OP } from "./tokenizer";

export const MONOTYPE = {
  Undefined: "undefined",
  Number: "number",
  String: "string",
  Boolean: "boolean",
};

export function infer(mbql) {
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

  if (op === "case" || op === "coalesce") {
    // TODO
    return MONOTYPE.Undefined;
  }

  const func = MBQL_CLAUSES[op];
  if (func) {
    const returnType = func.type;
    switch (returnType) {
      case "object":
        return MONOTYPE.Undefined;
      case "aggregation":
        return MONOTYPE.Number;
      default:
        return returnType;
    }
  }

  return MONOTYPE.Undefined;
}
