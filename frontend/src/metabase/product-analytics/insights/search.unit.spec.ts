import _ from "underscore";

import { indexCounts } from "./counts";
import { findInsights } from "./search";
import type { GroupCounts, Insight } from "./types";

/** People who share every attribute value, and how many of them converted. */
type Segment = {
  values: Record<string, string>;
  reached: number;
  converted: number;
};

const sumCounts = (segments: readonly Segment[]) => ({
  reached: segments.reduce((sum, { reached }) => sum + reached, 0),
  converted: segments.reduce((sum, { converted }) => sum + converted, 0),
});

/**
 * What the singles and pairs queries would return for these people at one
 * question, with every value kept for pairs.
 */
const countSegments = (segments: readonly Segment[]) => {
  const attributeIds = _.uniq(
    segments.flatMap(({ values }) => Object.keys(values)),
  );
  const valuesOf = (attributeId: string) =>
    _.uniq(segments.map(({ values }) => values[attributeId]));
  const groupOf = (conditions: Record<string, string>): GroupCounts => ({
    question: 1,
    conditions: Object.entries(conditions).map(([attributeId, value]) => ({
      attributeId,
      value,
    })),
    ...sumCounts(
      segments.filter(({ values }) =>
        Object.entries(conditions).every(([id, value]) => values[id] === value),
      ),
    ),
  });

  const singles = attributeIds.flatMap((id) =>
    valuesOf(id).map((value) => groupOf({ [id]: value })),
  );
  const pairs = attributeIds.flatMap((a, i) =>
    attributeIds
      .slice(i + 1)
      .flatMap((b) =>
        valuesOf(a).flatMap((valueA) =>
          valuesOf(b).map((valueB) => groupOf({ [a]: valueA, [b]: valueB })),
        ),
      ),
  );
  return indexCounts({
    rows: [groupOf({}), ...singles, ...pairs].filter(
      ({ reached }) => reached > 0,
    ),
    singleAttributes: attributeIds,
    pairValues: new Map(attributeIds.map((id) => [id, valuesOf(id)])),
  });
};

const describeInsight = ({ conditions }: Insight) =>
  conditions
    .map(({ attributeId, value }) => `${attributeId}=${value}`)
    .join(" & ");

const findDescribed = (segments: readonly Segment[]) =>
  findInsights(countSegments(segments)).map(describeInsight);

describe("findInsights", () => {
  it("finds nothing when conversion doesn't depend on any attribute", () => {
    expect(
      findDescribed([
        { values: { os: "iOS" }, reached: 1000, converted: 300 },
        { values: { os: "Android" }, reached: 1000, converted: 300 },
        { values: { os: "Windows" }, reached: 3000, converted: 900 },
      ]),
    ).toEqual([]);
  });

  it("finds a group that converts differently from everyone else", () => {
    const insights = findInsights(
      countSegments([
        { values: { os: "iOS" }, reached: 1000, converted: 150 },
        { values: { os: "Android" }, reached: 1000, converted: 300 },
        { values: { os: "Windows" }, reached: 3000, converted: 900 },
      ]),
    );
    expect(insights.map(describeInsight)).toEqual(["os=iOS"]);
    expect(insights[0]).toMatchObject({
      reached: 1000,
      converted: 150,
      rate: 0.15,
      restRate: 0.3,
      excess: -150,
    });
  });

  it("leaves out groups too small to report, however strong their effect", () => {
    expect(
      findDescribed([
        { values: { country: "NZ" }, reached: 60, converted: 55 },
        { values: { country: "US" }, reached: 10000, converted: 2500 },
      ]),
    ).toEqual([]);
  });

  it("reports a group that never converts", () => {
    // People who already signed up can't sign up again.
    expect(
      findDescribed([
        { values: { plan: "free" }, reached: 1000, converted: 0 },
        { values: { plan: "(not set)" }, reached: 4000, converted: 1200 },
      ]),
    ).toEqual(["plan=free"]);
  });

  it("leaves out a group whose effect comes from a narrower group inside it", () => {
    // Every iOS user is on Safari; Safari on macOS converts like everyone else.
    expect(
      findDescribed([
        {
          values: { os: "iOS", browser: "Safari" },
          reached: 1000,
          converted: 150,
        },
        {
          values: { os: "macOS", browser: "Safari" },
          reached: 600,
          converted: 180,
        },
        {
          values: { os: "macOS", browser: "Chrome" },
          reached: 1400,
          converted: 420,
        },
        {
          values: { os: "Windows", browser: "Chrome" },
          reached: 2000,
          converted: 600,
        },
      ]),
    ).toEqual(["os=iOS"]);
  });

  it("leaves out the mirror image of a stronger group", () => {
    // Desktop only looks better because iOS mobile users are worse.
    expect(
      findDescribed([
        {
          values: { device: "mobile", os: "iOS" },
          reached: 1000,
          converted: 150,
        },
        {
          values: { device: "mobile", os: "Android" },
          reached: 1000,
          converted: 300,
        },
        {
          values: { device: "desktop", os: "Windows" },
          reached: 3000,
          converted: 900,
        },
      ]),
    ).toEqual(["os=iOS"]);
  });

  it("reports a pair that only matters in combination, instead of its parts", () => {
    expect(
      findDescribed([
        {
          values: { os: "Android", browser: "Firefox" },
          reached: 400,
          converted: 20,
        },
        {
          values: { os: "Android", browser: "Chrome" },
          reached: 2000,
          converted: 500,
        },
        {
          values: { os: "Windows", browser: "Firefox" },
          reached: 2400,
          converted: 600,
        },
        {
          values: { os: "Windows", browser: "Chrome" },
          reached: 16000,
          converted: 4000,
        },
      ]),
    ).toEqual(["os=Android & browser=Firefox"]);
  });

  it("doesn't report a pair whose attributes each matter on their own", () => {
    // Base odds 0.25; iOS halves them and sales emails double them, independently.
    const insights = findDescribed([
      {
        values: { os: "iOS", source: "sales" },
        reached: 1000,
        converted: 200,
      },
      {
        values: { os: "iOS", source: "organic" },
        reached: 4000,
        converted: 444,
      },
      {
        values: { os: "Windows", source: "sales" },
        reached: 4000,
        converted: 1333,
      },
      {
        values: { os: "Windows", source: "organic" },
        reached: 16000,
        converted: 3200,
      },
    ]);
    expect(insights).toHaveLength(2);
    expect(insights).toEqual(
      expect.arrayContaining(["os=iOS", "source=sales"]),
    );
  });

  it("reports the narrower of the two values of a yes/no column", () => {
    expect(
      findDescribed([
        { values: { os: "iOS" }, reached: 1000, converted: 150 },
        { values: { os: "Windows" }, reached: 4000, converted: 1200 },
      ]),
    ).toEqual(["os=iOS"]);
  });

  it("reports one of two columns that always describe the same people", () => {
    expect(
      findDescribed([
        {
          values: { utm_source: "(not set)", utm_medium: "(not set)" },
          reached: 3000,
          converted: 900,
        },
        {
          values: { utm_source: "google", utm_medium: "cpc" },
          reached: 3000,
          converted: 600,
        },
      ]),
    ).toEqual(["utm_source=(not set)"]);
  });

  it("ranks insights by how many conversions they account for", () => {
    const insights = findInsights(
      countSegments([
        { values: { os: "iOS" }, reached: 1000, converted: 150 },
        { values: { os: "Linux" }, reached: 600, converted: 300 },
        { values: { os: "Windows" }, reached: 8000, converted: 2400 },
      ]),
    );
    const excesses = insights.map(({ excess }) => Math.abs(excess));
    expect(excesses).toEqual([...excesses].sort((a, b) => b - a));
  });
});
