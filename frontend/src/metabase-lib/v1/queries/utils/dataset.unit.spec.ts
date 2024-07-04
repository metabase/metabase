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
    it("should find indexes for columns without base-type", () => {
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
        fieldRef: ["field", ORDERS.TOTAL, null],
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("should find indexes for columns with base-type", () => {
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
        fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("should find indexes for columns with different base-type", () => {
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
        fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
        enabled: true,
      });

      expect(
        findColumnIndexesForColumnSettings([column], [columnSetting]),
      ).toEqual([0]);
    });
  });

  describe("findColumnSettingIndexesForColumns", () => {
    it("should find indexes for column settings without base-type", () => {
      const column = createMockColumn({
        id: ORDERS.TOTAL,
        name: "TOTAL",
        display_name: "Total",
        field_ref: ["field", ORDERS.TOTAL, null],
      });
      const columnSetting = createMockTableColumnOrderSetting({
        name: "TOTAL",
        fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("should find indexes for column settings with base-type", () => {
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
        fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("should find indexes for column settings with different base-type", () => {
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
        fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Number" }],
        enabled: true,
      });

      expect(
        findColumnSettingIndexesForColumns([column], [columnSetting]),
      ).toEqual([0]);
    });

    it("should find indexes for column settings when the field ref changes from a string (metabase#42049)", () => {
      const columns = [
        createMockColumn({
          id: ORDERS.TOTAL,
          name: "TOTAL",
          field_ref: ["field", "TOTAL", { "base-type": "type/Float" }],
        }),
        createMockColumn({
          id: ORDERS.SUBTOTAL,
          name: "SUBTOTAL",
          field_ref: ["field", "SUBTOTAL", { "base-type": "type/Float" }],
        }),
      ];
      const columnSettings = [
        createMockTableColumnOrderSetting({
          name: "SUBTOTAL",
          fieldRef: ["field", ORDERS.SUBTOTAL, { "base-type": "type/Float" }],
          enabled: true,
        }),
        createMockTableColumnOrderSetting({
          name: "TOTAL",
          fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
          enabled: true,
        }),
      ];
      expect(
        findColumnSettingIndexesForColumns(columns, columnSettings),
      ).toEqual([1, 0]);
    });

    it("should find indexes for column settings when the field ref changes from an expression to a field (metabase#39993)", () => {
      const columns = [
        createMockColumn({
          id: ORDERS.TOTAL,
          name: "TOTAL",
          field_ref: ["field", "TOTAL", { "base-type": "type/Float" }],
        }),
        createMockColumn({
          id: undefined,
          name: "expr",
          field_ref: ["field", "expr", { "base-type": "type/Float" }],
        }),
      ];
      const columnSettings = [
        createMockTableColumnOrderSetting({
          name: "TOTAL",
          fieldRef: ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
          enabled: true,
        }),
        createMockTableColumnOrderSetting({
          name: "expr",
          fieldRef: ["expression", "expr"],
          enabled: true,
        }),
      ];
      expect(
        findColumnSettingIndexesForColumns(columns, columnSettings),
      ).toEqual([0, 1]);
    });
  });
});
