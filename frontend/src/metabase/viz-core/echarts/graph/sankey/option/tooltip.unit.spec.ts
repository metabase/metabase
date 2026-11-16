import type { RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getSankeyChartModel } from "../model";

import { getConversionRows } from "./tooltip";

const CONVERTED = "Converted";
const NOT_CONVERTED = "Didn't convert";

const setup = () => {
  const textColumn = (name: string) =>
    createMockColumn({ name, display_name: name, base_type: "type/Text" });
  const cols = [
    textColumn("source"),
    textColumn("target"),
    textColumn("source_label"),
    textColumn("target_label"),
    textColumn("target_kind"),
    textColumn("outcome"),
    createMockColumn({
      name: "weight",
      display_name: "weight",
      base_type: "type/Integer",
    }),
  ];
  const flows: [string, number, number][] = [
    ["/signup", 60, 140],
    ["/", 10, 190],
  ];
  const rows: RowValue[][] = flows.flatMap(
    ([next, converted, notConverted]) => [
      [
        "1. Pricing",
        `2. ${next}`,
        "Pricing",
        next,
        "step",
        CONVERTED,
        converted,
      ],
      [
        "1. Pricing",
        `2. ${next}`,
        "Pricing",
        next,
        "step",
        NOT_CONVERTED,
        notConverted,
      ],
      [
        `2. ${next}`,
        "3. (converted) Purchased",
        next,
        "Purchased",
        "converted",
        CONVERTED,
        converted,
      ],
      [
        `2. ${next}`,
        "3. (dropped)",
        next,
        "(Dropped off)",
        "dropped",
        NOT_CONVERTED,
        notConverted,
      ],
    ],
  );
  const model = getSankeyChartModel(
    [{ card: createMockCard(), data: createMockDatasetData({ cols, rows }) }],
    {
      "sankey.source": "source",
      "sankey.target": "target",
      "sankey.value": "weight",
      "sankey.breakout": "outcome",
      "product_analytics.paths": true,
    },
  );
  const rowsFor = (key: string, focusedTarget?: string) => {
    const node = model.data.nodes.find(({ rawName }) => rawName === key);
    const conversion = model.conversion?.byNode.get(key);
    if (node === undefined || conversion === undefined) {
      throw new Error(`No conversion for ${key}`);
    }
    return getConversionRows(model, node, conversion, focusedTarget);
  };
  return { rowsFor };
};

describe("getConversionRows", () => {
  it("lists each next step with its people and conversion, and the node's total", () => {
    const { rowsFor } = setup();
    const { rows, footer } = rowsFor("1. Pricing");

    expect(rows.map(({ name, values }) => [name, ...values])).toEqual([
      ["/signup", "200", "30.0% converted"],
      ["/", "200", "5.0% converted"],
    ]);
    expect(footer).toEqual({
      name: "Total",
      values: ["400", "17.5% converted"],
    });
  });

  it("compares a node with the average in the total", () => {
    const { rowsFor } = setup();

    expect(rowsFor("2. /signup").footer?.name).toBe("Total · 1.7× average");
  });

  it("focuses the hovered link's target", () => {
    const { rowsFor } = setup();

    expect(
      rowsFor("1. Pricing", "2. /").rows.map(({ isFocused }) => isFocused),
    ).toEqual([false, true]);
  });

  it("shows an end node as a single row", () => {
    const { rowsFor } = setup();

    expect(rowsFor("3. (converted) Purchased")).toEqual({
      rows: [
        expect.objectContaining({
          name: "Purchased",
          values: ["70", "100.0% converted"],
        }),
      ],
    });
  });
});
