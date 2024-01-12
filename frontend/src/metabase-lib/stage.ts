import * as ML from "cljs/metabase.lib.js";

import { aggregations } from "./aggregation";
import { breakouts } from "./breakout";
import { expressions } from "./expression";
import { fields } from "./fields";
import { filters } from "./filter";
import { joins } from "./join";
import { hasLimit } from "./limit";
import { orderBys } from "./order_by";
import type { Query } from "./types";

export const hasAnyClauses = (query: Query, stageIndex: number): boolean => {
  const hasJoins = joins(query, stageIndex).length > 0;
  const hasExpressions = expressions(query, stageIndex).length > 0;
  const hasFilters = filters(query, stageIndex).length > 0;
  const hasAggregations = aggregations(query, stageIndex).length > 0;
  const hasBreakouts = breakouts(query, stageIndex).length > 0;
  const hasOrderBys = orderBys(query, stageIndex).length > 0;
  const hasLimits = hasLimit(query, stageIndex);
  const hasFields = fields(query, stageIndex).length > 0;

  return (
    hasJoins ||
    hasExpressions ||
    hasFilters ||
    hasAggregations ||
    hasBreakouts ||
    hasOrderBys ||
    hasLimits ||
    hasFields
  );
};

export function stageCount(query: Query): number {
  return ML.stage_count(query);
}

export function appendStage(query: Query): Query {
  return ML.append_stage(query);
}

export function dropStage(query: Query, stageIndex: number): Query {
  return ML.drop_stage(query, stageIndex);
}

export function dropStageIfEmpty(query: Query, stageIndex: number): Query {
  return ML.drop_stage_if_empty(query, stageIndex);
}

export function dropEmptyStages(query: Query): Query {
  const stageIndexes = Array.from({ length: stageCount(query) }).map(
    (_, index) => index,
  );

  return stageIndexes.reduceRight((query, stageIndex) => {
    return dropStageIfEmpty(query, stageIndex);
  }, query);
}
