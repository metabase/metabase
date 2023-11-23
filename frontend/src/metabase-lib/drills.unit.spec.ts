import type { DatasetColumn } from "metabase-types/api";
import { createOrdersTotalDatasetColumn } from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery, findDrillThru } from "./test-helpers";

describe("drill-thru/sort", () => {
  const drillType = "drill-thru/sort";
  const initialQuery = createQuery();
  const findColumn = columnFinder(
    initialQuery,
    Lib.orderableColumns(initialQuery, 0),
  );

  describe("availableDrillThrus", () => {
    it("should return directions for unsorted query", () => {
      const { drillInfo } = getDrillInfo(
        initialQuery,
        createOrdersTotalDatasetColumn(),
        drillType,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc", "desc"],
      });
    });

    it("should return directions when the query is sorted ascending", () => {
      const query = Lib.orderBy(
        initialQuery,
        0,
        findColumn("ORDERS", "TOTAL"),
        "asc",
      );
      const { drillInfo } = getDrillInfo(
        query,
        createOrdersTotalDatasetColumn(),
        drillType,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["desc"],
      });
    });

    it("should return directions when the query is sorted descending", () => {
      const query = Lib.orderBy(
        initialQuery,
        0,
        findColumn("ORDERS", "TOTAL"),
        "desc",
      );
      const { drillInfo } = getDrillInfo(
        query,
        createOrdersTotalDatasetColumn(),
        drillType,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc"],
      });
    });
  });
});

function getDrillInfo(
  query: Lib.Query,
  column: DatasetColumn,
  drillType: Lib.DrillThruType,
) {
  const drills = Lib.availableDrillThrus(query, 0, column);
  const drill = findDrillThru(query, 0, drills, drillType);
  const drillInfo = Lib.displayInfo(query, 0, drill);
  return { drill, drillInfo };
}
