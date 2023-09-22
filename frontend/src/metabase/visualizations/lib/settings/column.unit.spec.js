import {
  columnSettings,
  buildTableColumnSettings,
} from "metabase/visualizations/lib/settings/column";

import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  createMockColumn,
  createMockSingleSeries,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

function seriesWithColumn(col) {
  return [
    {
      card: {},
      data: {
        cols: [
          {
            name: "foo",
            base_type: "type/Float",
            semantic_type: "type/Currency",
            ...col,
          },
        ],
      },
    },
  ];
}

describe("column settings", () => {
  it("should find by column name", () => {
    const series = seriesWithColumn({});
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["name","foo"]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  it("should find by column 'field' ID ref", () => {
    const series = seriesWithColumn({
      id: 42,
      field_ref: ["field", 42, null],
    });
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["ref",["field",42,null]]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  it("should find by column name if it also has a 'field-literal' ref", () => {
    const series = seriesWithColumn({
      field_ref: ["field", "foo", { "base-type": "type/Float" }],
    });
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["name","foo"]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  it("should find by column name if it also has a 'aggregation' ref", () => {
    const series = seriesWithColumn({
      field_ref: ["aggregation", 0],
    });
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["name","foo"]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  it("should set a time style but no date style for hour-of-day", () => {
    const series = seriesWithColumn({
      unit: "hour-of-day",
      base_type: "type/DateTime",
      semantic_type: undefined,
    });
    const defs = { ...columnSettings() };
    const computed = getComputedSettings(defs, series, {});
    const { time_enabled, time_style, date_style } = computed.column(
      series[0].data.cols[0],
    );
    expect(time_enabled).toEqual("minutes");
    expect(time_style).toEqual("h:mm A");
    expect(date_style).toEqual("");
  });

  it("should show new columns and show them as disabled (metabase#25592)", () => {
    const storedSettings = {
      "table.columns": [
        createMockTableColumnOrderSetting({
          name: "ID",
          fieldRef: ["field", ORDERS.ID, null],
          enabled: true,
        }),
      ],
    };

    const series = [
      createMockSingleSeries(
        {},
        {
          data: {
            cols: [
              createMockColumn({
                id: ORDERS.ID,
                name: "ID",
                display_name: "Id",
                field_ref: ["field", ORDERS.ID, null],
              }),
              createMockColumn({
                id: ORDERS.SUBTOTAL,
                name: "SUBTOTAL",
                display_name: "Total",
                field_ref: ["field", ORDERS.SUBTOTAL, null],
              }),
            ],
          },
        },
      ),
    ];

    const computedValue = buildTableColumnSettings()["table.columns"].getValue(
      series,
      storedSettings,
    );

    const computedSubtotal = computedValue.find(
      ({ name }) => name === "SUBTOTAL",
    );

    expect(computedSubtotal).not.toBeUndefined();
    expect(computedSubtotal.enabled).toBe(false);
  });

  it("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", () => {
    const storedSettings = {
      "table.columns": [
        createMockTableColumnOrderSetting({
          name: "TAX",
          fieldRef: ["field", ORDERS.TAX, null],
          enabled: true,
        }),
        createMockTableColumnOrderSetting({
          name: "DISCOUNT",
          fieldRef: ["field", ORDERS.DISCOUNT, null],
          enabled: false,
        }),
      ],
    };

    const series = [
      createMockSingleSeries(
        {},
        {
          data: {
            cols: [
              createMockColumn({
                id: ORDERS.ID,
                name: "ID",
                display_name: "Id",
                field_ref: ["field", ORDERS.ID, null],
              }),
            ],
          },
        },
      ),
    ];

    const computedValue = buildTableColumnSettings()["table.columns"].getValue(
      series,
      storedSettings,
    );

    expect(computedValue.length).toBe(1);
    expect(computedValue[0]).toMatchObject({
      name: "ID",
      enabled: true,
    });
  });
});
