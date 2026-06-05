import type * as Lib from "metabase-lib";

import type { Token } from "./pratt";

export type Hooks = {
  error?: (error: Error) => void;
  lexified?: (evt: { tokens: Token[] }) => void;
  compiled?: (evt: {
    expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
    expressionClause: Lib.ExpressionClause;
  }) => void;
};
