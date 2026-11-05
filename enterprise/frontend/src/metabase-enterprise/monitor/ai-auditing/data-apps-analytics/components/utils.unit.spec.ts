import {
  DEFAULT_SORTING,
  type DataAppLogColumn,
} from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import type { SortingOptions } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { getEffectiveSorting, getLogRows } from "./utils";

describe("getEffectiveSorting", () => {
  const sorting: SortingOptions<DataAppLogColumn> = {
    sort_column: "result_rows",
    sort_direction: "asc",
  };

  it("keeps a sort on a sortable column", () => {
    expect(getEffectiveSorting(sorting, ["started_at", "result_rows"])).toBe(
      sorting,
    );
  });

  it("falls back to newest first when the sorted column isn't sortable", () => {
    expect(getEffectiveSorting(sorting, ["started_at"])).toEqual(
      DEFAULT_SORTING,
    );
  });
});

describe("getLogRows", () => {
  it("matches the result's columns case-insensitively and keys rows by the record", () => {
    const rows = getLogRows(
      {
        cols: [
          createMockColumn({ name: "STARTED_AT" }),
          createMockColumn({ name: "ENTITY_ID" }),
        ],
        rows: [["2026-10-20T08:00:00Z", "robin"]],
      },
      ["started_at"],
      0,
    );

    expect(rows).toEqual([{ id: "robin", started_at: "2026-10-20T08:00:00Z" }]);
  });

  it("reads a remapped column from the column it's remapped to", () => {
    const rows = getLogRows(
      {
        cols: [
          createMockColumn({
            name: "card_qualified_id",
            remapped_to: "card_name",
          }),
          createMockColumn({ name: "card_name" }),
          createMockColumn({ name: "entity_id" }),
        ],
        rows: [["card_1", "Bird sightings", "sparrow"]],
      },
      ["card_qualified_id"],
      0,
    );

    expect(rows).toEqual([
      { id: "sparrow", card_qualified_id: "Bird sightings" },
    ]);
  });

  it("leaves a column the result lacks empty and falls back to the row's position on the page", () => {
    const rows = getLogRows(
      {
        cols: [createMockColumn({ name: "user_id" })],
        rows: [[1], [2]],
      },
      ["user_id", "ip_address"],
      3,
    );

    expect(rows).toEqual([
      { id: "3-0", user_id: 1, ip_address: null },
      { id: "3-1", user_id: 2, ip_address: null },
    ]);
  });
});
