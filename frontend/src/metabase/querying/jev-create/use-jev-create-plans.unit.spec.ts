import type { JevCreateIntentTable } from "metabase/api/jev-create";

import { getDashboardTableIds, getQuestionTable } from "./use-jev-create-plans";

function createTable(
  id: number,
  probability: number,
  relevance: number,
): JevCreateIntentTable {
  return {
    id,
    db_id: 1,
    name: `T${id}`,
    display_name: `Table ${id}`,
    schema: null,
    probability,
    relevance,
  };
}

describe("getDashboardTableIds", () => {
  it("tops up to three tables by relevance", () => {
    expect(
      getDashboardTableIds([
        createTable(1, 0.5, 0.86),
        createTable(2, 0.3, 0.33),
        createTable(3, 0.1, 0.1),
        createTable(4, 0.1, 0.2),
      ]),
    ).toEqual([1, 2, 4]);
  });

  it("keeps every relevant table, up to five", () => {
    const tables = [1, 2, 3, 4, 5, 6].map((id) =>
      createTable(id, 0, 0.9 - id * 0.05),
    );
    expect(getDashboardTableIds(tables)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns what there is when there are few tables", () => {
    expect(getDashboardTableIds([createTable(1, 0.9, 0.1)])).toEqual([1]);
  });
});

describe("getQuestionTable", () => {
  it("picks the top table when it plausibly fits", () => {
    expect(getQuestionTable([createTable(1, 0.98, 0.9)])?.id).toBe(1);
  });

  it("picks nothing when no table fits", () => {
    expect(getQuestionTable([createTable(1, 0.02, 0.9)])).toBeNull();
  });
});
