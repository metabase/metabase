import type { DatasetColumn, RowValue } from "metabase-types/api";
import {
  createOrdersQuantityDatasetColumn,
  createPeopleLatitudeDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findBinningStrategy,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createCountColumn } from "./drills-common";

describe("drill-thru/zoom-in.binning", () => {
  const drillType = "drill-thru/zoom-in.binning";
  const stageIndex = 0;
  const aggregationColumn = createCountColumn();

  describe.each([
    {
      name: "numeric",
      tableName: "ORDERS",
      breakoutColumn: createOrdersQuantityDatasetColumn({ source: "breakout" }),
      buckets: ["Auto bin", "10 bins", "50 bins", "100 bins"],
    },
    {
      name: "location",
      tableName: "PEOPLE",
      breakoutColumn: createPeopleLatitudeDatasetColumn({ source: "breakout" }),
      buckets: [
        "Auto bin",
        "Bin every 0.1 degrees",
        "Bin every 1 degree",
        "Bin every 10 degrees",
        "Bin every 20 degrees",
      ],
    },
  ])("$name", ({ tableName, breakoutColumn, buckets }) => {
    describe("availableDrillThrus", () => {
      it.each(buckets)(
        'should allow to drill with "%s" binning strategy',
        bucketName => {
          const query = createQueryWithBreakout(
            tableName,
            breakoutColumn.name,
            bucketName,
          );
          const { value, row, dimensions } = getCellData(
            aggregationColumn,
            breakoutColumn,
            10,
          );

          const { drillInfo } = findDrillThru(
            drillType,
            query,
            stageIndex,
            aggregationColumn,
            value,
            row,
            dimensions,
          );

          expect(drillInfo).toMatchObject({
            type: drillType,
          });
        },
      );

      it("should not allow to drill without binning strategy", () => {
        const query = createQueryWithBreakout(
          tableName,
          breakoutColumn.name,
          "Don't bin",
        );
        const { value, row, dimensions } = getCellData(
          aggregationColumn,
          breakoutColumn,
          10,
        );

        const drill = queryDrillThru(
          drillType,
          query,
          stageIndex,
          aggregationColumn,
          value,
          row,
          dimensions,
        );

        expect(drill).toBeNull();
      });

      it("should not allow to drill when clicked on a column", () => {
        const query = createQueryWithBreakout(
          tableName,
          breakoutColumn.name,
          "Auto bin",
        );

        const drill = queryDrillThru(
          drillType,
          query,
          stageIndex,
          aggregationColumn,
        );

        expect(drill).toBeNull();
      });

      it("should not allow to drill with a non-editable query", () => {
        const query = createNotEditableQuery(
          createQueryWithBreakout(tableName, breakoutColumn.name, "Auto bin"),
        );
        const { value, row, dimensions } = getCellData(
          aggregationColumn,
          breakoutColumn,
          10,
        );

        const drill = queryDrillThru(
          drillType,
          query,
          stageIndex,
          aggregationColumn,
          value,
          row,
          dimensions,
        );

        expect(drill).toBeNull();
      });
    });

    describe("drillThru", () => {
      it.each(buckets)(
        'should drill when clicked on an aggregated cell with "%s" binning strategy',
        bucketName => {
          const query = createQueryWithBreakout(
            tableName,
            breakoutColumn.name,
            bucketName,
          );
          const { value, row, dimensions } = getCellData(
            aggregationColumn,
            breakoutColumn,
            10,
          );
          const { drill } = findDrillThru(
            drillType,
            query,
            stageIndex,
            aggregationColumn,
            value,
            row,
            dimensions,
          );

          const newQuery = Lib.drillThru(query, stageIndex, drill);

          expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
          expect(Lib.filters(newQuery, stageIndex)).toHaveLength(2);
        },
      );
    });
  });
});

function createQueryWithBreakout(
  tableName: string,
  columnName: string,
  bucketName: string,
) {
  const query = createQuery();

  const queryWithAggregation = Lib.aggregate(
    query,
    -1,
    Lib.aggregationClause(findAggregationOperator(query, "count")),
  );

  const breakoutColumn = columnFinder(
    queryWithAggregation,
    Lib.breakoutableColumns(queryWithAggregation, -1),
  )(tableName, columnName);

  return Lib.breakout(
    queryWithAggregation,
    -1,
    Lib.withBinning(
      breakoutColumn,
      findBinningStrategy(query, breakoutColumn, bucketName),
    ),
  );
}

function createNotEditableQuery(query: Lib.Query) {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [],
      }),
    ],
  });

  return createQuery({
    metadata,
    query: Lib.toLegacyQuery(query),
  });
}

function getCellData(
  aggregationColumn: DatasetColumn,
  breakoutColumn: DatasetColumn,
  value: RowValue,
) {
  const row = [
    { key: breakoutColumn.name, col: breakoutColumn, value: 10 },
    { key: aggregationColumn.name, col: aggregationColumn, value },
  ];
  const dimensions = [{ column: breakoutColumn, value }];

  return { value, row, dimensions };
}
