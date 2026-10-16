import { getInsightBreakdownSettings } from "./breakdown-settings";
import type { InsightAttribute } from "./types";

const ATTRIBUTES: InsightAttribute[] = [
  { id: "attr_1", column: "os", from: "events", displayName: "OS" },
  { id: "attr_2", column: "country", from: "users", displayName: "Country" },
];

describe("getInsightBreakdownSettings", () => {
  it("breaks the funnel down by the insight's attributes at its transition", () => {
    expect(
      getInsightBreakdownSettings(
        {
          transition: 2,
          conditions: [
            { attributeId: "attr_2", value: "FR" },
            { attributeId: "attr_1", value: "iOS" },
          ],
        },
        ATTRIBUTES,
      ),
    ).toEqual({
      "funnel.view": "steps",
      "funnel.breakdown": [
        { column: "country", from: "users" },
        { column: "os", from: "events" },
      ],
      "funnel.breakdown_step": 2,
    });
  });

  it("skips attributes it doesn't know", () => {
    expect(
      getInsightBreakdownSettings(
        { transition: 1, conditions: [{ attributeId: "attr_9", value: "x" }] },
        ATTRIBUTES,
      )["funnel.breakdown"],
    ).toEqual([]);
  });
});
