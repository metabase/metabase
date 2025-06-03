import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { checkArgCount } from "./check-arg-count";
import { checkArgValidators } from "./check-arg-validators";
import { checkCaseOrIfArgCount } from "./check-case-or-if-arg-count";
import { checkComparisonOperatorArgs } from "./check-comparison-operator-args";
import { checkKnownFunctions } from "./check-known-functions";
import { checkLibDiagnostics } from "./check-lib-diagnostics";
import { checkSupportedFunctions } from "./check-supported-functions";

const expressionChecks = [
  checkKnownFunctions,
  checkSupportedFunctions,
  checkArgValidators,
  checkArgCount,
  checkComparisonOperatorArgs,
  checkCaseOrIfArgCount,
  checkLibDiagnostics,
];

export function diagnoseExpression(options: {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  expressionClause: Lib.ExpressionClause;
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  expressionIndex?: number;
  metadata?: Metadata;
}) {
  expressionChecks.forEach((check) => check(options));
}
