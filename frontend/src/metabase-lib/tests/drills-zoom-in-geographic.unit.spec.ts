import {
  createOrdersTable,
  createPeopleCityDatasetColumn,
  createPeopleIdField,
  createPeopleLatitudeDatasetColumn,
  createPeopleLatitudeField,
  createPeopleLongitudeDatasetColumn,
  createPeopleLongitudeField,
  createPeopleStateDatasetColumn,
  createPeopleStateField,
  createPeopleTable,
  createSampleDatabase,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createPivotCellClickObject,
  createQuery,
  createQueryWithClauses,
  findDrillThru,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createPeopleCountryDatasetColumn,
  createPeopleCountryField,
} from "./drills-common";

describe("drill-thru/zoom-in.geographic (metabase#36247)", () => {
  const drillType = "drill-thru/zoom-in.geographic";
  const stageIndex = 0;
  const defaultQuery = Lib.withDifferentTable(createQuery(), PEOPLE_ID);

  describe("State, City -> LatLon", () => {
    it.each([
      createPeopleStateDatasetColumn({ source: "breakout" }),
      createPeopleCityDatasetColumn({ source: "breakout" }),
    ])(
      'should drill thru an aggregated cell with "$semantic_type" column',
      breakoutColumn => {
        const query = createQueryWithClauses({
          query: defaultQuery,
          aggregations: [{ operatorName: "count" }],
          breakouts: [{ columnName: breakoutColumn.name, tableName: "PEOPLE" }],
        });
        const clickObject = createAggregatedCellClickObject({
          aggregation: { column: createCountDatasetColumn(), value: 5 },
          breakouts: [{ column: breakoutColumn, value: 10 }],
        });
        const { drill } = findDrillThru(
          query,
          stageIndex,
          clickObject,
          drillType,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);
        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(2);
      },
    );
  });

  // No one can remember ever seeing Country => State work in the old MLv1 code, so we made a concious decision not to
  // port it. If we ever want to add it again we can re-enable this test. See this thread for more info.
  // https://metaboat.slack.com/archives/C04CYTEL9N2/p1701826072570649 -- Cam
  //
  // eslint-disable-next-line jest/no-disabled-tests
  describe.skip("Country -> State", () => {
    const metadata = createMockMetadata({
      databases: [
        createSampleDatabase({
          tables: [
            createOrdersTable(),
            createPeopleTable({
              fields: [
                createPeopleIdField(),
                createPeopleCountryField(),
                createPeopleStateField(),
                createPeopleLatitudeField(),
                createPeopleLongitudeField(),
              ],
            }),
          ],
        }),
      ],
    });

    it("should drill thru an aggregated cell and prefer State over LatLon columns", () => {
      const query = Lib.withDifferentTable(
        createQuery({ metadata }),
        PEOPLE_ID,
      );
      const clickObject = createAggregatedCellClickObject({
        aggregation: { column: createCountDatasetColumn(), value: 5 },
        breakouts: [
          {
            column: createPeopleCountryDatasetColumn({ source: "breakout" }),
            value: "A",
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
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });
  });

  describe("Country -> LatLon", () => {
    const metadata = createMockMetadata({
      databases: [
        createSampleDatabase({
          tables: [
            createOrdersTable(),
            createPeopleTable({
              fields: [
                createPeopleIdField(),
                createPeopleCountryField(),
                createPeopleLatitudeField(),
                createPeopleLongitudeField(),
              ],
            }),
          ],
        }),
      ],
    });

    it("should drill thru an aggregated cell and use LatLon columns if State isn't available", () => {
      const query = createQueryWithClauses({
        query: Lib.withDifferentTable(createQuery({ metadata }), PEOPLE_ID),
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: "COUNTRY", tableName: "PEOPLE" }],
      });
      const clickObject = createAggregatedCellClickObject({
        aggregation: { column: createCountDatasetColumn(), value: 5 },
        breakouts: [
          {
            column: createPeopleCountryDatasetColumn({ source: "breakout" }),
            value: "A",
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
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(2);
    });
  });

  describe.each(["Auto bin", "Bin every 1 degree", "Bin every 0.1 degrees"])(
    'LatLon -> LatLon with "%s" binning strategy',
    binningStrategyName => {
      const query = createQueryWithClauses({
        query: defaultQuery,
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: "LATITUDE",
            tableName: "PEOPLE",
            binningStrategyName,
          },
          {
            columnName: "LONGITUDE",
            tableName: "PEOPLE",
            binningStrategyName,
          },
        ],
      });

      const dimensions = {
        aggregation: { column: createCountDatasetColumn(), value: 5 },
        breakouts: [
          {
            column: createPeopleLatitudeDatasetColumn(),
            value: 10,
          },
          {
            column: createPeopleLongitudeDatasetColumn(),
            value: 20,
          },
        ],
      };

      it("should drill thru an aggregated cell", () => {
        const clickObject = createAggregatedCellClickObject(dimensions);
        const { drill } = findDrillThru(
          query,
          stageIndex,
          clickObject,
          drillType,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);
        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(2);
      });

      it("should drill thru a pivot cell", () => {
        const clickObject = createPivotCellClickObject(dimensions);
        const { drill } = findDrillThru(
          query,
          stageIndex,
          clickObject,
          drillType,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);
        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(2);
      });
    },
  );
});
