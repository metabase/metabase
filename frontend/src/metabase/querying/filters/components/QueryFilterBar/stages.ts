import type { FilterStages, FilterTree } from "metabase/filter-bar";
import * as Lib from "metabase-lib";

export type QueryFilter = Lib.Filterable;

type GroupOperator = "and" | "or";

const isGroupOperator = (operator: string): operator is GroupOperator =>
  operator === "and" || operator === "or";

const leaf = (filter: QueryFilter): FilterTree<QueryFilter> => ({
  type: "leaf",
  filter,
});

const isGroupArg = (
  arg: Lib.ExpressionParts | Lib.ExpressionArg,
): arg is Lib.ExpressionParts | Lib.SegmentMetadata =>
  Lib.isSegmentMetadata(arg) || Lib.isExpressionParts(arg);

const partsToTree = (
  parts: Lib.ExpressionParts | Lib.SegmentMetadata,
  filter: QueryFilter,
): FilterTree<QueryFilter> => {
  if (Lib.isSegmentMetadata(parts)) {
    return leaf(filter);
  }
  const { operator, args } = parts;
  const isGroup = isGroupOperator(operator) && args.every(isGroupArg);
  if (!isGroup) {
    return leaf(filter);
  }
  return {
    type: operator,
    children: args
      .filter(isGroupArg)
      .map((arg) =>
        Lib.isSegmentMetadata(arg)
          ? leaf(arg)
          : partsToTree(arg, Lib.expressionClause(arg)),
      ),
  };
};

const filterToTree = (
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): FilterTree<QueryFilter> => {
  const parts = Lib.expressionParts(query, stageIndex, filter);
  return isGroupArg(parts) ? partsToTree(parts, filter) : leaf(filter);
};

export const getFilterQuery = (query: Lib.Query) =>
  Lib.ensureFilterStage(query);

export const getQueryStages = (query: Lib.Query): FilterStages<QueryFilter> => {
  const filterQuery = getFilterQuery(query);
  const stageFilters = Lib.stageIndexes(filterQuery).map((stageIndex) =>
    Lib.filters(filterQuery, stageIndex).map((filter) =>
      filterToTree(filterQuery, stageIndex, filter),
    ),
  );
  const lastFilteredStage = stageFilters.findLastIndex(
    (children) => children.length > 0,
  );
  return stageFilters
    .slice(0, lastFilteredStage + 1)
    .map((children) => ({ type: "and", children }));
};

const treeToClause = (tree: FilterTree<QueryFilter>): QueryFilter | null => {
  if (tree.type === "leaf") {
    return tree.filter;
  }
  const clauses = tree.children
    .map(treeToClause)
    .filter((clause) => clause !== null);
  if (clauses.length <= 1) {
    return clauses[0] ?? null;
  }
  return Lib.expressionClause(tree.type, clauses);
};

const treeToClauses = (tree: FilterTree<QueryFilter> | undefined) => {
  if (!tree) {
    return [];
  }
  const trees = tree.type === "and" ? tree.children : [tree];
  return trees.map(treeToClause).filter((clause) => clause !== null);
};

const setStageFilters = (
  query: Lib.Query,
  stageIndex: number,
  tree: FilterTree<QueryFilter> | undefined,
) => {
  const cleared = Lib.filters(query, stageIndex).reduce(
    (query, filter) => Lib.removeClause(query, stageIndex, filter),
    query,
  );
  return treeToClauses(tree).reduce(
    (query, clause) => Lib.filter(query, stageIndex, clause),
    cleared,
  );
};

export const applyQueryStages = (
  query: Lib.Query,
  stages: FilterStages<QueryFilter>,
): Lib.Query => {
  const filterQuery = getFilterQuery(query);
  const nextQuery = Lib.stageIndexes(filterQuery).reduce(
    (query, stageIndex) =>
      setStageFilters(query, stageIndex, stages[stageIndex]),
    filterQuery,
  );
  return Lib.dropEmptyStages(nextQuery);
};
