import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { getComputedSettings } from "metabase/visualizations/lib/settings";

function seriesWithColumn(col) {
  return [
    {
      card: {},
      data: {
        cols: [
          {
            name: "foo",
            base_type: "type/Float",
            special_type: "type/Currency",
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
  it("should find by column 'field-id' ref", () => {
    const series = seriesWithColumn({
      id: 42,
      field_ref: ["field-id", 42],
    });
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["ref",["field-id",42]]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  // DISABLED to match legacy behavior until we determine the best way to reference columns
  xit("should find by column 'field-literal' ref", () => {
    const series = seriesWithColumn({
      field_ref: ["field-literal", "foo", "type/Float"],
    });
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["ref",["field-literal","foo","type/Float"]]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column(series[0].data.cols[0]).currency).toEqual("BTC");
  });
  it("should find by column name if it also has a 'field-literal' ref", () => {
    const series = seriesWithColumn({
      field_ref: ["field-literal", "foo", "type/Float"],
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
      special_type: undefined,
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
});
