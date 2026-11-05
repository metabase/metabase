import type { HistoryBinding } from "metabase/metadata/table-structure";
import { createMockField } from "metabase-types/api/mocks";

import { buildCurrentRowsSql } from "./current-rows-sql";

const TABLE = { schema: "analytics", name: "subscription_history" };

const FIELDS = [
  createMockField({ id: 1, name: "id" }),
  createMockField({ id: 2, name: "updated_at" }),
  createMockField({ id: 3, name: "valid_to" }),
  createMockField({ id: 4, name: "version" }),
];

const createBinding = (binding: Partial<HistoryBinding>): HistoryBinding => ({
  durableKeyFieldId: 1,
  validFromFieldId: 2,
  validToFieldId: null,
  currentFlagFieldId: null,
  versionFieldId: null,
  currentRowsOnly: true,
  ...binding,
});

describe("buildCurrentRowsSql", () => {
  it("orders by a column once when it is both valid from and version", () => {
    const sql = buildCurrentRowsSql(
      TABLE,
      FIELDS,
      createBinding({ versionFieldId: 2 }),
    );

    expect(sql).toContain("ORDER BY updated_at DESC\n");
  });

  it("breaks ties on valid from with the version column", () => {
    const sql = buildCurrentRowsSql(
      TABLE,
      FIELDS,
      createBinding({ versionFieldId: 4 }),
    );

    expect(sql).toContain("ORDER BY updated_at DESC, version DESC\n");
  });

  it("keeps only rows that can be current before ranking", () => {
    const sql = buildCurrentRowsSql(
      TABLE,
      FIELDS,
      createBinding({ validToFieldId: 3 }),
    );

    expect(sql).toContain("FROM analytics.subscription_history\n  WHERE");
    expect(sql).toMatch(/WHERE version_rank = 1$/);
  });

  it("returns null without an entity key", () => {
    expect(
      buildCurrentRowsSql(
        TABLE,
        FIELDS,
        createBinding({ durableKeyFieldId: null }),
      ),
    ).toBeNull();
  });
});
