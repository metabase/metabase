import type * as Lib from "metabase-lib";

export function op(
  operator: string,
  ...args: (Lib.ExpressionParts | Lib.ExpressionArg)[]
): Lib.ExpressionParts {
  return {
    operator: operator as Lib.ExpressionOperator,
    options: {},
    args,
  };
}

export function opt(
  operator: string,
  options: Lib.ExpressionOptions,
  ...args: (Lib.ExpressionParts | Lib.ExpressionArg)[]
): Lib.ExpressionParts {
  return {
    operator: operator as Lib.ExpressionOperator,
    options,
    args,
  };
}

export function value(
  x: number | string | boolean | bigint,
  type: string,
): Lib.ExpressionParts {
  return opt(
    "value",
    {
      "base-type": type,
      "effective-type": type,
    },
    x,
  );
}
