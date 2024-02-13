import { columnSettings } from "metabase/visualizations/lib/settings/column";
import registerVisualizations from "metabase/visualizations/register";
import { getComputedSettings } from "metabase/visualizations/lib/settings";

registerVisualizations();

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
  it("should set a percentage style to a column with percentage type in its metadata", () => {
    const series = seriesWithColumn({
      semantic_type: "type/Percentage",
    });
    const defs = { ...columnSettings() };
    const computed = getComputedSettings(defs, series, {});
    const { number_style } = computed.column(series[0].data.cols[0]);
    expect(number_style).toBe("percent");
  });
});
