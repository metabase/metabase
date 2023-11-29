import {
  createOrdersQuantityDatasetColumn,
  createPeopleLatitudeDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createColumnClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQuery,
  createCountColumn,
  createNotEditableQuery,
} from "./drills-common";

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("drill-thru/zoom-in.binning (metabase#36177)", () => {
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
          const query = createAggregatedQuery({
            aggregationOperatorName: "count",
            breakoutColumnName: breakoutColumn.name,
            breakoutColumnTableName: tableName,
            breakoutColumnBinningStrategyName: bucketName,
          });
          const clickObject = createAggregatedCellClickObject({
            aggregationColumn,
            aggregationColumnValue: 10,
            breakoutColumn,
            breakoutColumnValue: 20,
          });

          const { drillInfo } = findDrillThru(
            query,
            stageIndex,
            clickObject,
            drillType,
          );

          expect(drillInfo).toMatchObject({
            type: drillType,
          });
        },
      );

      it("should not allow to drill without binning strategy", () => {
        const query = createAggregatedQuery({
          aggregationOperatorName: "count",
          breakoutColumnName: breakoutColumn.name,
          breakoutColumnTableName: tableName,
          breakoutColumnBinningStrategyName: "Don't bin",
        });
        const clickObject = createAggregatedCellClickObject({
          aggregationColumn,
          aggregationColumnValue: 10,
          breakoutColumn,
          breakoutColumnValue: 20,
        });

        const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
        expect(drill).toBeNull();
      });

      it("should not allow to drill when clicked on a column", () => {
        const query = createAggregatedQuery({
          aggregationOperatorName: "count",
          breakoutColumnName: breakoutColumn.name,
          breakoutColumnTableName: tableName,
          breakoutColumnBinningStrategyName: "Auto bin",
        });
        const clickObject = createColumnClickObject({
          column: aggregationColumn,
        });

        const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
        expect(drill).toBeNull();
      });

      it("should not allow to drill with a non-editable query", () => {
        const query = createNotEditableQuery(
          createAggregatedQuery({
            aggregationOperatorName: "count",
            breakoutColumnName: breakoutColumn.name,
            breakoutColumnTableName: tableName,
            breakoutColumnBinningStrategyName: "Auto bin",
          }),
        );
        const clickObject = createAggregatedCellClickObject({
          aggregationColumn,
          aggregationColumnValue: 10,
          breakoutColumn,
          breakoutColumnValue: 20,
        });

        const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
        expect(drill).toBeNull();
      });
    });

    describe("drillThru", () => {
      it.each(buckets)(
        'should drill when clicked on an aggregated cell with "%s" binning strategy',
        bucketName => {
          const query = createAggregatedQuery({
            aggregationOperatorName: "count",
            breakoutColumnName: breakoutColumn.name,
            breakoutColumnTableName: tableName,
            breakoutColumnBinningStrategyName: bucketName,
          });
          const clickObject = createAggregatedCellClickObject({
            aggregationColumn,
            aggregationColumnValue: 10,
            breakoutColumn,
            breakoutColumnValue: 20,
          });
          const { drill } = findDrillThru(
            query,
            stageIndex,
            clickObject,
            drillType,
          );

          const newQuery = Lib.drillThru(query, stageIndex, drill);

          expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
          expect(Lib.filters(newQuery, stageIndex)).toHaveLength(2);
        },
      );
    });
  });
});
