import * as ML from "cljs/metabase.lib.js";

import type {
  Clause,
  ExternalOp,
  JoinConditionClause,
  JoinConditionExternalOp,
} from "./types";

declare function ExternalOpFn(
  condition: JoinConditionClause,
): JoinConditionExternalOp;
declare function ExternalOpFn(clause: Clause): ExternalOp;

export const externalOp: typeof ExternalOpFn = ML.external_op;
