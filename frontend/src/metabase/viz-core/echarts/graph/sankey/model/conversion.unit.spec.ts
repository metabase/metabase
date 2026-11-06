import Color from "color";

import type { RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getConversionColor } from "./conversion";
import { getPathColors } from "./paths";

import { getSankeyChartModel } from "./index";

const CONVERTED = "Converted";
const NOT_CONVERTED = "Didn't convert";

const COLORS = getPathColors();

type Flow = {
  next: string;
  converted: number;
  notConverted: number;
};

/** People who viewed pricing, where they went next, and how that turned out. */
const setup = (flows: Flow[]) => {
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
  const rows: RowValue[][] = flows.flatMap(
    ({ next, converted, notConverted }) => [
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
  return getSankeyChartModel(
    [{ card: createMockCard(), data: createMockDatasetData({ cols, rows }) }],
    {
      "sankey.source": "source",
      "sankey.target": "target",
      "sankey.value": "weight",
      "sankey.breakout": "outcome",
      "sankey.breakout_colors": {
        [CONVERTED]: COLORS.converted,
        [NOT_CONVERTED]: COLORS.dropped,
      },
      "product_analytics.paths": true,
    },
  );
};

const FLOWS: Flow[] = [
  { next: "/signup", converted: 60, notConverted: 140 },
  { next: "/", converted: 10, notConverted: 190 },
  { next: "/docs", converted: 1, notConverted: 9 },
];

describe("getSankeyChartModel conversion", () => {
  it("counts each node's people and how many went on to convert", () => {
    const conversion = setup(FLOWS).conversion?.byNode;

    expect(conversion?.get("1. Pricing")).toMatchObject({
      people: 410,
      converted: 71,
    });
    expect(conversion?.get("2. /signup")).toMatchObject({
      people: 200,
      converted: 60,
      rate: 0.3,
    });
  });

  it("compares each node with the average of its step, however small, except outcome nodes", () => {
    const conversion = setup(FLOWS).conversion?.byNode;
    const stepRate = 71 / 410;

    expect(conversion?.get("2. /signup")?.lift).toBeCloseTo(0.3 / stepRate);
    expect(conversion?.get("2. /")?.lift).toBeCloseTo(0.05 / stepRate);
    expect(conversion?.get("2. /docs")?.lift).toBeCloseTo(0.1 / stepRate);
    expect(conversion?.get("3. (converted) Purchased")?.lift).toBeUndefined();
    expect(conversion?.get("1. Pricing")?.lift).toBeUndefined();
  });

  it("colors nodes by how they convert against their step", () => {
    const { nodeColors } = setup(FLOWS);

    expect(nodeColors["1. Pricing"]).toBe(COLORS.neutral);
    expect(nodeColors["2. /signup"]).not.toBe(COLORS.neutral);
    expect(nodeColors["2. /signup"]).not.toBe(COLORS.dropped);
    expect(nodeColors["2. /"]).toBe(COLORS.dropped);
    expect(nodeColors["2. /docs"]).toBe(
      getConversionColor(0.1 / (71 / 410), COLORS),
    );
    expect(nodeColors["2. /docs"]).not.toBe(COLORS.neutral);
    expect(nodeColors["3. (converted) Purchased"]).toBe(COLORS.converted);
    expect(nodeColors["3. (dropped)"]).toBe(COLORS.dropped);
  });

  it("orders each step from highest to lowest conversion, with outcomes at the edges", () => {
    const model = setup(FLOWS);

    expect(model.data.nodes.map(({ rawName }) => rawName)).toEqual([
      "1. Pricing",
      "2. /signup",
      "2. /docs",
      "2. /",
      "3. (converted) Purchased",
      "3. (dropped)",
    ]);
  });

  it("lists where people went next, in node order, with their conversion", () => {
    const pricing = setup(FLOWS).conversion?.byNode.get("1. Pricing");

    expect(
      pricing?.nextSteps.map(({ node, people, rate }) => [
        node.displayName,
        people,
        rate,
      ]),
    ).toEqual([
      ["/signup", 200, 0.3],
      ["/docs", 10, 0.1],
      ["/", 200, 0.05],
    ]);
    expect(pricing?.nextSteps.map((step) => step.color)).toEqual([
      getConversionColor(0.3 / (71 / 410), COLORS),
      getConversionColor(0.1 / (71 / 410), COLORS),
      COLORS.dropped,
    ]);
  });
});

describe("getPathColors", () => {
  it("keeps the translucent neutral gray light once it's made opaque", () => {
    expect(Color(COLORS.neutral).alpha()).toBe(1);
    expect(Color(COLORS.neutral).lightness()).toBeGreaterThan(40);
  });
});

describe("getConversionColor", () => {
  it("is neutral at the average and saturates at twice or half of it", () => {
    expect(getConversionColor(1, COLORS)).toBe(COLORS.neutral);
    expect(getConversionColor(undefined, COLORS)).toBe(COLORS.neutral);
    expect(getConversionColor(2, COLORS)).toBe(COLORS.converted);
    expect(getConversionColor(5, COLORS)).toBe(COLORS.converted);
    expect(getConversionColor(0.5, COLORS)).toBe(COLORS.dropped);
    expect(getConversionColor(0, COLORS)).toBe(COLORS.dropped);
  });
});
