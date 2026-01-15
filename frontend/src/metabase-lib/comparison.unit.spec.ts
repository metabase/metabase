import * as Lib from "metabase-lib";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createTestQuery,
} from "./test-helpers";

describe("findColumnIndexesFromLegacyRefs", () => {
  const stageIndex = -1;

  it("should match columns that differ only by temporal buckets", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, SAMPLE_METADATA);
    const query = createTestQuery(provider, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          breakouts: [
            {
              name: "CREATED_AT",
              unit: "year",
            },
            {
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
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, SAMPLE_METADATA);
    const query = createTestQuery(provider, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          breakouts: [
            {
              name: "TOTAL",
              binningCount: 10,
            },
            {
              name: "TOTAL",
              binningCount: 50,
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
