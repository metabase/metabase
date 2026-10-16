import { OTHER_VALUE } from "../sql/analyses/funnel-insights";

import { indexCounts } from "./counts";
import { getInsightSegments, getMinSegmentSize } from "./segments";
import type { GroupCounts, Insight, InsightCondition } from "./types";

const TRANSITION = 1;

const group = (
  values: Record<string, string>,
  reached: number,
  converted: number,
): GroupCounts => ({
  transition: TRANSITION,
  conditions: Object.entries(values).map(([attributeId, value]) => ({
    attributeId,
    value,
  })),
  reached,
  converted,
});

type InsightOpts = {
  conditions: InsightCondition[];
  isHigher: boolean;
};

const insightOf = ({ conditions, isHigher }: InsightOpts): Insight => ({
  transition: TRANSITION,
  conditions,
  reached: 100,
  converted: 0,
  rate: isHigher ? 0.6 : 0.2,
  restRate: 0.4,
  excess: 0,
  pValue: 0,
});

const BROWSER_ROWS = [
  group({}, 1000, 440),
  group({ browser: "Chrome" }, 500, 250),
  group({ browser: "Safari" }, 300, 60),
  group({ browser: "Firefox" }, 150, 90),
  group({ browser: "Edge" }, 50, 40),
  group({ os: "iOS" }, 1000, 440),
];

const summarize = (segments: ReturnType<typeof getInsightSegments>) =>
  segments.map(({ label, reached, converted }) => [label, reached, converted]);

describe("getMinSegmentSize", () => {
  it("is the insight search's minimum group size, in whole people", () => {
    expect(getMinSegmentSize(1000)).toBe(100);
    expect(getMinSegmentSize(25_050)).toBe(251);
  });
});

describe("getInsightSegments", () => {
  it("sorts a worse-converting insight's segments from the lowest rate, with small ones pooled last", () => {
    const index = indexCounts({
      rows: BROWSER_ROWS,
      singleAttributes: ["browser", "os"],
    });
    const insight = insightOf({
      conditions: [{ attributeId: "browser", value: "Safari" }],
      isHigher: false,
    });

    expect(summarize(getInsightSegments(index, insight))).toEqual([
      ["Safari", 300, 60],
      ["Chrome", 500, 250],
      ["Firefox", 150, 90],
      [OTHER_VALUE, 50, 40],
    ]);
  });

  it("sorts a better-converting insight's segments from the highest rate, still pooling small ones last", () => {
    const index = indexCounts({
      rows: BROWSER_ROWS,
      singleAttributes: ["browser", "os"],
    });
    const insight = insightOf({
      conditions: [{ attributeId: "browser", value: "Firefox" }],
      isHigher: true,
    });

    expect(summarize(getInsightSegments(index, insight))).toEqual([
      ["Firefox", 150, 90],
      ["Chrome", 500, 250],
      ["Safari", 300, 60],
      [OTHER_VALUE, 50, 40],
    ]);
  });

  it("leaves out the pooled segment when every segment is large enough", () => {
    const index = indexCounts({
      rows: [
        group({}, 1000, 400),
        group({ device: "desktop" }, 600, 300),
        group({ device: "mobile" }, 400, 100),
      ],
      singleAttributes: ["device"],
    });
    const insight = insightOf({
      conditions: [{ attributeId: "device", value: "mobile" }],
      isHigher: false,
    });

    expect(summarize(getInsightSegments(index, insight))).toEqual([
      ["mobile", 400, 100],
      ["desktop", 600, 300],
    ]);
  });

  it("labels pairs in the insight's order and pools the values pairs didn't keep", () => {
    const index = indexCounts({
      rows: [
        group({}, 1000, 400),
        group({ browser: "Firefox" }, 300, 60),
        group({ os: "Android" }, 500, 170),
        group({ os: "Android", browser: "Firefox" }, 200, 20),
        group({ os: "Android", browser: "Chrome" }, 300, 150),
        group({ os: "iOS", browser: "Safari" }, 250, 125),
      ],
      singleAttributes: ["browser", "os"],
      pairValues: new Map([
        ["browser", ["Firefox", "Chrome", "Safari"]],
        ["os", ["Android", "iOS"]],
      ]),
    });
    const insight = insightOf({
      conditions: [
        { attributeId: "browser", value: "Firefox" },
        { attributeId: "os", value: "Android" },
      ],
      isHigher: false,
    });

    expect(summarize(getInsightSegments(index, insight))).toEqual([
      ["Firefox · Android", 200, 20],
      ["Chrome · Android", 300, 150],
      ["Safari · iOS", 250, 125],
      [OTHER_VALUE, 250, 105],
    ]);
  });
});
