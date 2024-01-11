import { aggregations } from "./aggregation";
import { breakouts } from "./breakout";
import { expressions } from "./expression";
import { fields } from "./fields";
import { filters } from "./filter";
import { joins } from "./join";
import { hasLimit } from "./limit";
import { orderBys } from "./order_by";
import { stageCount } from "./query";
import type { Query } from "./types";

export const hasAnyClauses = (query: Query): boolean => {
  return stageCount(query) > 1 || hasAnyClausesAtStage(query, 0);
};

export const hasAnyClausesAtStage = (
  query: Query,
  stageIndex: number,
): boolean => {
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
