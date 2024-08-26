import {
  createMockColumn,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "./dataset";

describe("dataset utils", () => {
  describe("findColumnIndexesForColumnSettings", () => {
    it("finds columnIndex for ColumnSettings without base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Number",
          },
        ],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("finds columnIndex for ColumnSettings with base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Number",
          },
        ],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("finds findColumnIndexesForColumnSettings for Columns with different base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Text",
          },
        ],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });
  });

  describe("findColumnSettingIndexesForColumns", () => {
    it("finds columnSettingsIndex for Column without base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: ["field", ORDERS.TOTAL, null],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("finds columnSettingsIndex for Columns with base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Number",
          },
        ],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("finds columnSettingsIndex for Columns with different base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: [
          "field",
          ORDERS.TOTAL,
          {
            "base-type": "type/Text",
          },
        ],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });
  });
});
