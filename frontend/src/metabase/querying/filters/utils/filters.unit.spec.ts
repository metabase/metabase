import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { getGroupItems, hasFilters, removeFilters } from "./filters";

const STAGE_COUNT = 4;

function createFilteredQuery(query: Lib.Query) {
  const joinTable = Lib.tableOrCardMetadata(query, PRODUCTS_ID);
  const queryWithJoin = Lib.join(
    query,
    -1,
    Lib.joinClause(
      joinTable,
      [
        Lib.joinConditionClause(
          query,
          -1,
          Lib.joinConditionOperators(query, -1)[0],
          Lib.joinConditionLHSColumns(query, -1)[0],
          Lib.joinConditionRHSColumns(query, -1, joinTable)[0],
        ),
      ],
      Lib.availableJoinStrategies(query, -1)[0],
    ),
  );

  const queryWithFilter = Lib.filter(
    queryWithJoin,
    -1,
    Lib.expressionClause("=", [1, 1]),
  );

  return createQueryWithClauses({
    query: queryWithFilter,
    aggregations: [{ operatorName: "count" }],
    breakouts: [{ tableName: "ORDERS", columnName: "TOTAL" }],
  });
}

function createMultiStageFilteredQuery() {
  const stageIndexes = Array.from({ length: STAGE_COUNT }, (_, i) => i);
  return stageIndexes.reduce(
    query => Lib.appendStage(createFilteredQuery(query)),
    createQuery(),
  );
}

describe("getGroupItems", () => {
  it("should return groups for all stages", () => {
    const query = createMultiStageFilteredQuery();
    expect(getGroupItems(query).map(group => group.displayName)).toEqual([
      "Orders",
      "Products",
      "User",
      "Summaries",
      "Products",
      "Summaries (2)",
      "Products",
      "Summaries (3)",
      "Products",
      "Summaries (4)",
    ]);
  });
});

describe("hasFilters", () => {
  it("should be true if there are filters on each stage", () => {
    const query = createMultiStageFilteredQuery();
    expect(hasFilters(query)).toBe(true);
  });

  it("should be true if there is a filter on a deeply nested stage", () => {
    const stages = Array(STAGE_COUNT).fill(0);
    const query = stages.reduce(
      Lib.appendStage,
      createFilteredQuery(createQuery()),
    );
    expect(hasFilters(query)).toBe(true);
  });

  it("should be false if there are no filters on any stage", () => {
    const stages = Array(STAGE_COUNT).fill(0);
    const query = stages.reduce(Lib.appendStage, createQuery());
    expect(hasFilters(query)).toBe(false);
  });
});

describe("removeFilters", () => {
  it("should remove filters from all stages", () => {
    const query = createMultiStageFilteredQuery();
    const newQuery = removeFilters(query);
    const stageIndexes = Lib.stageIndexes(newQuery);
    expect(stageIndexes).toEqual([0, 1, 2, 3, 4]);
    stageIndexes.forEach(stageIndex => {
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(0);
    });
  });
});
