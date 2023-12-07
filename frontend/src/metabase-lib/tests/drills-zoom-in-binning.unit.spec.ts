import type { BinningMetadata } from "metabase-types/api";
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
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

describe("drill-thru/zoom-in.binning (metabase#36177)", () => {
  const drillType = "drill-thru/zoom-in.binning";
  const stageIndex = 0;
  const aggregationColumn = createCountDatasetColumn();

  describe.each([
    {
      name: "numeric",
      tableName: "ORDERS",
      breakoutColumn: createOrdersQuantityDatasetColumn({ source: "breakout" }),
      binningStrategies: [
        { name: "Auto bin", metadata: { binning_strategy: "default" } },
        {
          name: "10 bins",
          metadata: { binning_strategy: "num-bins", num_bins: 10 },
        },
        {
          name: "50 bins",
          metadata: { binning_strategy: "num-bins", num_bins: 50 },
        },
        {
          name: "100 bins",
          metadata: { binning_strategy: "num-bins", num_bins: 100 },
        },
      ],
    },
    {
      name: "location",
      tableName: "PEOPLE",
      breakoutColumn: createPeopleLatitudeDatasetColumn({ source: "breakout" }),
      binningStrategies: [
        { name: "Auto bin", metadata: { binning_strategy: "default" } },
        {
          name: "Bin every 0.1 degrees",
          metadata: { binning_strategy: "bin-width", bin_width: 0.1 },
        },
        {
          name: "Bin every 1 degree",
          metadata: { binning_strategy: "bin-width", bin_width: 1 },
        },
        {
          name: "Bin every 10 degrees",
          metadata: { binning_strategy: "bin-width", bin_width: 10 },
        },
        {
          name: "Bin every 20 degrees",
          metadata: { binning_strategy: "bin-width", bin_width: 20 },
        },
      ],
    },
  ])("$name", ({ tableName, breakoutColumn, binningStrategies }) => {
    it.each(binningStrategies)(
      'should drill thru an aggregated cell with "%s" binning strategy',
      ({ name: binningStrategy, metadata: binningMetadata }) => {
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

        const clickObject = createAggregatedCellClickObject({
          aggregation: {
            column: aggregationColumn,
            value: 10,
          },
          breakouts: [
            {
              column: {
                ...breakoutColumn,
                binning_info: binningMetadata as BinningMetadata,
              },
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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not drill thru a non-editable query (#36125)", () => {
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
            column: {
              ...breakoutColumn,
              binning_info: { binning_strategy: "default" },
            },
            value: 20,
          },
        ],
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });
});
