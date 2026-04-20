import { checkNotNull } from "metabase/utils/types";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import registerVisualizations from "metabase/visualizations/register";
import type { DatasetColumn, Series } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import {
  NUMBER_COLUMN_SETTINGS,
  columnSettings,
  tableColumnSettings,
} from "./column";

registerVisualizations();

function seriesWithColumn(column?: Partial<DatasetColumn>): Series {
  return [
    createMockSingleSeries(
      {},
      {
        data: {
          cols: [
            createMockColumn({
              name: "foo",
              base_type: "type/Float",
              semantic_type: "type/Currency",
              ...column,
            }),
          ],
        },
      },
    ),
  ];
}

describe("column settings", () => {
  it("should find by column name", () => {
    const series = seriesWithColumn();
    const defs = { ...columnSettings() };
    const stored = {
      column_settings: {
        '["name","foo"]': {
          currency: "BTC",
        },
      },
    };
    const computed = getComputedSettings(defs, series, stored);
    expect(computed.column?.(series[0].data.cols[0]).currency).toEqual("BTC");
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
    expect(computed.column?.(series[0].data.cols[0]).currency).toEqual("BTC");
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
    expect(computed.column?.(series[0].data.cols[0]).currency).toEqual("BTC");
  });

  it("should find by column name if it also has an 'aggregation' ref", () => {
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
    expect(computed.column?.(series[0].data.cols[0]).currency).toEqual("BTC");
  });

  it("should set a time style but no date style for hour-of-day", () => {
    const series = seriesWithColumn({
      unit: "hour-of-day",
      base_type: "type/DateTime",
      semantic_type: undefined,
    });
    const defs = { ...columnSettings() };
    const computed = getComputedSettings(defs, series, {});
    const { time_enabled, time_style, date_style } = checkNotNull(
      computed.column?.(series[0].data.cols[0]),
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
    const { number_style } = checkNotNull(
      computed.column?.(series[0].data.cols[0]),
    );
    expect(number_style).toBe("percent");
  });

  describe("tableColumnSettings default seeding", () => {
    const buildSeries = (cols: Partial<DatasetColumn>[]): Series => [
      createMockSingleSeries(
        {},
        {
          data: {
            cols: cols.map((col, i) =>
              createMockColumn({ name: `c${i}`, ...col }),
            ),
          },
        },
      ),
    ];

    const seed = (
      cols: Partial<DatasetColumn>[],
      storedSettings: Record<string, unknown> = {},
    ) => {
      const def = checkNotNull(tableColumnSettings()["table.columns"]);
      const series = buildSeries(cols);
      return checkNotNull(def.getValue)(series, storedSettings);
    };

    it("defaults 'normal' columns to enabled: true", () => {
      const seeded = seed([
        { name: "a", visibility_type: "normal" },
        { name: "b" },
      ]);
      expect(seeded).toEqual([
        { name: "a", enabled: true },
        { name: "b", enabled: true },
      ]);
    });

    it("defaults 'hidden-by-default' columns to enabled: false", () => {
      const seeded = seed([
        { name: "a", visibility_type: "normal" },
        { name: "b", visibility_type: "hidden-by-default" },
        { name: "c", visibility_type: "details-only" },
      ]);
      expect(seeded).toEqual([
        { name: "a", enabled: true },
        { name: "b", enabled: false },
        { name: "c", enabled: true },
      ]);
    });

    it("preserves existing saved 'enabled: true' even after visibility_type flips to 'hidden-by-default'", () => {
      // Regression: the seeding branch only affects NEW columns that have no
      // matching setting. Existing saved settings should be returned verbatim.
      const seeded = seed(
        [
          { name: "a", visibility_type: "normal" },
          { name: "b", visibility_type: "hidden-by-default" },
        ],
        { "table.columns": [{ name: "b", enabled: true }] },
      );
      expect(seeded).toEqual([
        { name: "b", enabled: true },
        { name: "a", enabled: true },
      ]);
    });
  });

  describe("NUMBER_COLUMN_SETTINGS", () => {
    it("should have coherent options and onChange (metabase#54728)", () => {
      const onChangeSpy = jest.fn();
      const getProps = checkNotNull(
        NUMBER_COLUMN_SETTINGS.currency_in_header?.getProps,
      );

      const { options, onChange } = getProps(
        createMockColumn(),
        {},
        onChangeSpy,
        undefined,
        jest.fn(),
      ) as {
        options: { value: boolean }[];
        onChange: (value: boolean) => void;
      };

      onChange(options[0].value);
      expect(onChangeSpy).toHaveBeenCalledWith(true);

      onChange(options[1].value);
      expect(onChangeSpy).toHaveBeenCalledWith(false);
    });
  });
});
