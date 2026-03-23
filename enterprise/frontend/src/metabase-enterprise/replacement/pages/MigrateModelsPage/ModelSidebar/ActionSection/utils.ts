import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

export function isTableOnlyQuery(query: Lib.Query) {
  const tableId = Lib.sourceTableOrCardId(query);
  const stageCount = Lib.stageCount(query);
  const joins = Lib.joins(query, STAGE_INDEX);
  const expressions = Lib.expressions(query, STAGE_INDEX);
  const filters = Lib.filters(query, STAGE_INDEX);
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const orderBy = Lib.orderBys(query, STAGE_INDEX);
  const limit = Lib.currentLimit(query, STAGE_INDEX);

  return (
    typeof tableId === "number" &&
    stageCount === 1 &&
    joins.length === 0 &&
    expressions.length === 0 &&
    filters.length === 0 &&
    aggregations.length === 0 &&
    breakouts.length === 0 &&
    orderBy.length === 0 &&
    limit == null
  );
}
