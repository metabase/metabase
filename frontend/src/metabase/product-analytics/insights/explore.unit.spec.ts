import { getExploreData } from "./explore";
import { getConversionOutcome } from "./outcomes";
import type { InsightSegment } from "./segments";
import type { InsightAttribute } from "./types";

const IDENTIFIED: InsightAttribute = {
  kind: "column",
  id: "attr_1",
  column: "person__identified",
  from: "events",
  displayName: "Person Identified",
  asOf: "true-by-step",
};
const BROWSER: InsightAttribute = {
  kind: "column",
  id: "attr_2",
  column: "browser",
  from: "events",
  displayName: "Browser",
  asOf: "first-seen",
};

const segment = (label: string, values: string[]): InsightSegment => ({
  label,
  values,
  reached: 100,
  converted: 10,
  rate: 0.1,
});

describe("getExploreData", () => {
  it("labels each segment's values for reading", () => {
    const data = getExploreData(
      [
        segment("false · Safari", ["false", "Safari"]),
        segment("true · Firefox", ["true", "Firefox"]),
        segment("(other)", []),
      ],
      [IDENTIFIED, BROWSER],
      "SELECT 1",
      getConversionOutcome(),
    );
    expect(data.rows.map(([label]) => label)).toEqual([
      "Anonymous · Safari",
      "Identified · Firefox",
      "(other)",
    ]);
  });
});
