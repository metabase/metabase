import { formatNumber } from "metabase/utils/formatting";
import { checkNotNull } from "metabase/utils/types";
import type {
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
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

  describe("duration style", () => {
    it("should format plain number column with stored duration settings", () => {
      const series = seriesWithColumn({
        base_type: "type/Integer",
        semantic_type: null,
      });
      const column = series[0].data.cols[0];
      const formatWith = (settings: VisualizationSettings) =>
        formatNumber(
          4_442_706_500,
          getComputedSettings(columnSettings(), series, {
            column_settings: { '["name","foo"]': settings },
          }).column?.(column),
        );

      expect(
        formatWith({ number_style: "duration", duration_unit: "millisecond" }),
      ).toBe("1,234:05:07");
      expect(
        formatWith({
          number_style: "duration",
          duration_unit: "millisecond",
          duration_style: "narrow",
          duration_precision: "millisecond",
          number_separators: ", ",
        }),
      ).toBe("51d 10h 5m 6s 500ms");
    });

    it("should default to seconds, digital style, and seconds precision", () => {
      const series = seriesWithColumn({ base_type: "type/Integer" });
      const computed = checkNotNull(
        getComputedSettings(columnSettings(), series, {
          column_settings: { '["name","foo"]': { number_style: "duration" } },
        }).column?.(series[0].data.cols[0]),
      );

      expect(computed.duration_unit).toBe("second");
      expect(computed.duration_style).toBe("digital");
      expect(computed.duration_precision).toBe("second");
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
  });
});
