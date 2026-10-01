import { checkNotNull } from "metabase/utils/types";
import type { DatasetColumn, Series } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getComputedSettings } from "../settings";

import {
  NUMBER_COLUMN_SETTINGS,
  columnSettings,
  tableColumnSettings,
} from "./column";

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

  describe("NUMBER_COLUMN_SETTINGS", () => {
    it("should have coherent options and onChange (metabase#54728)", () => {
      const onChangeSpy = jest.fn();
      const getProps = checkNotNull(
        NUMBER_COLUMN_SETTINGS.currency_in_header?.getProps,
      );

      // Unjustified type cast. FIXME
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

  describe("table.columns", () => {
    it("should filter stale table column settings against current result columns (#76136)", () => {
      const series: Series = [
        createMockSingleSeries(
          {},
          {
            data: {
              cols: [
                createMockColumn({ name: "ID" }),
                createMockColumn({ name: "QUANTITY_RENAMED" }),
              ],
            },
          },
        ),
      ];

      const computed = getComputedSettings(tableColumnSettings(), series, {
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "QUANTITY", enabled: false },
          { name: "QUANTITY_RENAMED", enabled: true },
        ],
      });

      expect(computed["table.columns"]).toEqual([
        { name: "ID", enabled: true },
        { name: "QUANTITY_RENAMED", enabled: true },
      ]);
    });

    it("should place new result columns in their query position instead of appending them (metabase#82476)", () => {
      const series: Series = [
        createMockSingleSeries(
          {},
          {
            data: {
              cols: [
                createMockColumn({ name: "a" }),
                createMockColumn({ name: "b" }),
                createMockColumn({ name: "z" }),
                createMockColumn({ name: "c" }),
                createMockColumn({ name: "d" }),
                createMockColumn({ name: "e" }),
              ],
            },
          },
        ),
      ];

      const computed = getComputedSettings(tableColumnSettings(), series, {
        "table.columns": [
          { name: "a", enabled: true },
          { name: "b", enabled: true },
          { name: "c", enabled: false },
          { name: "d", enabled: true },
          { name: "e", enabled: true },
        ],
      });

      expect(computed["table.columns"]).toEqual([
        { name: "a", enabled: true },
        { name: "b", enabled: true },
        { name: "z", enabled: true },
        { name: "c", enabled: false },
        { name: "d", enabled: true },
        { name: "e", enabled: true },
      ]);
    });

    it("should keep the user's column order and insert a new column after its preceding result column", () => {
      const series: Series = [
        createMockSingleSeries(
          {},
          {
            data: {
              cols: [
                createMockColumn({ name: "a" }),
                createMockColumn({ name: "b" }),
                createMockColumn({ name: "z" }),
                createMockColumn({ name: "c" }),
                createMockColumn({ name: "d" }),
              ],
            },
          },
        ),
      ];

      const computed = getComputedSettings(tableColumnSettings(), series, {
        "table.columns": [
          { name: "d", enabled: true },
          { name: "a", enabled: true },
          { name: "b", enabled: true },
          { name: "c", enabled: true },
        ],
      });

      expect(computed["table.columns"]).toEqual([
        { name: "d", enabled: true },
        { name: "a", enabled: true },
        { name: "b", enabled: true },
        { name: "z", enabled: true },
        { name: "c", enabled: true },
      ]);
    });

    it("should place a new result column first when no column precedes it and keep adjacent new columns in query order", () => {
      const series: Series = [
        createMockSingleSeries(
          {},
          {
            data: {
              cols: [
                createMockColumn({ name: "z" }),
                createMockColumn({ name: "a" }),
                createMockColumn({ name: "x" }),
                createMockColumn({ name: "y" }),
                createMockColumn({ name: "b" }),
              ],
            },
          },
        ),
      ];

      const computed = getComputedSettings(tableColumnSettings(), series, {
        "table.columns": [
          { name: "b", enabled: true },
          { name: "a", enabled: false },
        ],
      });

      expect(computed["table.columns"]).toEqual([
        { name: "z", enabled: true },
        { name: "b", enabled: true },
        { name: "a", enabled: false },
        { name: "x", enabled: true },
        { name: "y", enabled: true },
      ]);
    });

    it("should use the result column order when there are no saved column settings", () => {
      const series: Series = [
        createMockSingleSeries(
          {},
          {
            data: {
              cols: [
                createMockColumn({ name: "b" }),
                createMockColumn({ name: "a" }),
              ],
            },
          },
        ),
      ];

      const computed = getComputedSettings(tableColumnSettings(), series, {});

      expect(computed["table.columns"]).toEqual([
        { name: "b", enabled: true },
        { name: "a", enabled: true },
      ]);
    });
  });
});
