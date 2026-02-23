import * as Lib from "metabase-lib";

import { createQueryWithClauses } from "./test-helpers";

describe("findColumnIndexesFromLegacyRefs", () => {
  const stageIndex = -1;

  it("should match columns that differ only by temporal buckets", () => {
    const query = createQueryWithClauses({
      breakouts: [
        {
          tableName: "ORDERS",
          columnName: "CREATED_AT",
          temporalBucketName: "Year",
        },
        {
          tableName: "ORDERS",
          columnName: "CREATED_AT",
          temporalBucketName: "Month",
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
    const query = createQueryWithClauses({
      breakouts: [
        {
          tableName: "ORDERS",
          columnName: "TOTAL",
          binningStrategyName: "10 bins",
        },
        {
          tableName: "ORDERS",
          columnName: "TOTAL",
          binningStrategyName: "50 bins",
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
