import {
  createOrdersQuantityDatasetColumn,
  createPeopleLatitudeDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createAggregatedCellClickObject,
  createColumnClickObject,
  findDrillThru,
  queryDrillThru,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("drill-thru/zoom-in.binning (metabase#36177)", () => {
  const drillType = "drill-thru/zoom-in.binning";
  const stageIndex = 0;
  const aggregationColumn = createCountDatasetColumn();

  describe.each([
    {
      name: "numeric",
      tableName: "ORDERS",
      breakoutColumn: createOrdersQuantityDatasetColumn({ source: "breakout" }),
      binningStrategies: ["Auto bin", "10 bins", "50 bins", "100 bins"],
    },
    {
      name: "location",
      tableName: "PEOPLE",
      breakoutColumn: createPeopleLatitudeDatasetColumn({ source: "breakout" }),
      binningStrategies: [
        "Auto bin",
        "Bin every 0.1 degrees",
        "Bin every 1 degree",
        "Bin every 10 degrees",
        "Bin every 20 degrees",
      ],
    },
  ])("$name", ({ tableName, breakoutColumn, binningStrategies }) => {
    it.each(binningStrategies)(
      'should drill thru an aggregated cell with "%s" binning strategy',
      binningStrategy => {
        const query = createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
          breakouts: [
            {
              columnName: breakoutColumn.name,
              tableName,
              binningStrategyName: binningStrategy,
            },
          ],
        });

        // make sure we're using the actual breakout column metadata as returned by MLv2 for the query, because if
        // it's missing breakout metadata it won't work. See
        // https://metaboat.slack.com/archives/C04CYTEL9N2/p1701818572333229 -- Cam
        const returnedColumns = Lib.returnedColumns(query, -1);
        const actualBreakoutColumn =
          breakoutColumn &&
          columnFinder(query, returnedColumns)(tableName, breakoutColumn.name);

        const clickObject = createAggregatedCellClickObject({
          aggregation: {
            column: aggregationColumn,
            value: 10,
          },
          breakouts: [
            {
              column: actualBreakoutColumn,
              value: 20,
            },
          ],
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

    it("should not drill thru an aggregated cell when the column has no binning strategy", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: breakoutColumn.name, tableName }],
      });
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            column: breakoutColumn,
            value: 20,
          },
        ],
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not drill thru an aggregated column", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: breakoutColumn.name,
            tableName,
            binningStrategyName: "Auto bin",
          },
        ],
      });
      const clickObject = createColumnClickObject({
        column: aggregationColumn,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not drill thru a non-editable query", () => {
      const query = createNotEditableQuery(
        createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
          breakouts: [
            {
              columnName: breakoutColumn.name,
              tableName,
              binningStrategyName: "Auto bin",
            },
          ],
        }),
      );
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            column: breakoutColumn,
            value: 20,
          },
        ],
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });
});
