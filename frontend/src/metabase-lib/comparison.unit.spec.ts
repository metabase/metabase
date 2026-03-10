import * as Lib from "metabase-lib";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { SAMPLE_PROVIDER } from "./test-helpers";

describe("findColumnIndexesFromLegacyRefs", () => {
  const stageIndex = -1;

  it("should match columns that differ only by temporal buckets", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          breakouts: [
            {
              type: "column",
              sourceName: "ORDERS",
              name: "CREATED_AT",
              unit: "year",
            },
            {
              type: "column",
              sourceName: "ORDERS",
              name: "CREATED_AT",
              unit: "month",
            },
          ],
        },
      ],
    });
    const columns = Lib.returnedColumns(query, stageIndex);
    const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      columns.map((column) => Lib.legacyRef(query, stageIndex, column)),
    );
    expect(columnIndexes).toEqual([0, 1]);
  });

  it("should match columns that differ only by binning", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          breakouts: [
            {
              type: "column",
              sourceName: "ORDERS",
              name: "TOTAL",
              bins: 10,
            },
            {
              type: "column",
              sourceName: "ORDERS",
              name: "TOTAL",
              bins: 50,
            },
          ],
        },
      ],
    });
    const columns = Lib.returnedColumns(query, stageIndex);
    const columnIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      columns.map((column) => Lib.legacyRef(query, stageIndex, column)),
    );
    expect(columnIndexes).toEqual([0, 1]);
  });
});
