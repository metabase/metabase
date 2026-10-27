import type { AnalysisSpec } from "../spec/types";

import type { MbqlBase } from "./analyses/base";
import { buildCohortsQuery } from "./analyses/cohorts";
import { buildFunnelQuery } from "./analyses/funnel";
import { buildHabitQuery } from "./analyses/habit";
import { buildLifecycleQuery } from "./analyses/lifecycle";
import { NotPortedError, type Query } from "./query";

/** The analysis as one MBQL 5 query on top of the base event query. */
export const buildAnalysisMbql = (
  spec: AnalysisSpec,
  base: MbqlBase,
): Query => {
  switch (spec.kind) {
    case "habit":
      return buildHabitQuery(spec, base);
    case "cohorts":
      return buildCohortsQuery(spec, base);
    case "lifecycle":
      return buildLifecycleQuery(spec, base);
    case "funnel":
      return buildFunnelQuery(spec, base);
    case "paths":
      throw new NotPortedError(`${spec.kind} isn't ported to MBQL yet`);
  }
};
