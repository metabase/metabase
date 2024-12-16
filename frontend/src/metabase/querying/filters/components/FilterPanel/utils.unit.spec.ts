import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import { getFilterItems } from "./utils";

const STAGE_COUNT = 4;

function createFilteredQuery(query: Lib.Query) {
  return Lib.filter(query, -1, Lib.expressionClause("=", [1, 1]));
}

function createMultiStageFilteredQuery() {
  const stageIndexes = Array.from({ length: STAGE_COUNT }, (_, i) => i);
  return stageIndexes.reduce(
    query => Lib.appendStage(createFilteredQuery(query)),
    createQuery(),
  );
}

describe("getFilterItems", () => {
  it("should get filters from all query stages", () => {
    const query = createMultiStageFilteredQuery();
    const items = getFilterItems(query);
    expect(items.length).toEqual(STAGE_COUNT);
  });
});
