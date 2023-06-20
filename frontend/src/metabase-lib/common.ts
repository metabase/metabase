import * as ML from "cljs/metabase.lib.js";

import type { Clause, ExternalOp } from "./types";

export function externalOp(clause: Clause): ExternalOp {
  return ML.external_op(clause);
}
