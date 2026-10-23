import _ from "underscore";

import { OTHER_VALUE, SEGMENT_SEPARATOR } from "../sql/analyses/insights";

import type { CountIndex } from "./counts";
import {
  DEFAULT_INSIGHT_OPTIONS,
  type InsightOptions,
  getMinGroupSize,
} from "./options";
import { rateOf, subtractCounts } from "./stats";
import type { Counts, GroupCounts, Insight } from "./types";

export type InsightSegment = Counts & {
  /** The attributes' values, joined, or `OTHER_VALUE` for the small segments. */
  label: string;
  /** The attributes' values, in order. Empty for the small segments. */
  values: string[];
  rate: number;
};

/** The rate expected of a segment, when the counts carry expected outcomes. */
export const getExpectedRate = ({
  reached,
  expected,
}: Counts): number | undefined =>
  expected !== undefined && reached > 0
    ? expected.outcomes / reached
    : undefined;

/** People in a segment smaller than this are counted in `OTHER_VALUE`. */
export const getMinSegmentSize = (
  questionReached: number,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): number => Math.ceil(getMinGroupSize(questionReached, options));

/** Better-converting insights list the best segments first; worse ones, the worst. */
export const isDescending = (insight: Pick<Insight, "rate" | "restRate">) =>
  insight.rate > insight.restRate;

const isSegmentOf = (group: GroupCounts, attributeIds: readonly string[]) =>
  group.conditions.length === attributeIds.length &&
  attributeIds.every((attributeId) =>
    group.conditions.some((condition) => condition.attributeId === attributeId),
  );

const valuesOf = (group: GroupCounts, attributeIds: readonly string[]) =>
  attributeIds.map(
    (attributeId) =>
      group.conditions.find(
        (condition) => condition.attributeId === attributeId,
      )?.value ?? "",
  );

const labelOf = (group: GroupCounts, attributeIds: readonly string[]) =>
  valuesOf(group, attributeIds).join(SEGMENT_SEPARATOR);

/**
 * The outcome rate at the insight's question by every combination of its
 * attributes' values, sorted by rate in the insight's direction. Segments too
 * small for a meaningful rate are pooled into a last `OTHER_VALUE` segment.
 */
export const getInsightSegments = (
  index: CountIndex,
  insight: Insight,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): InsightSegment[] => {
  const total = index.totals.get(insight.question);
  if (total === undefined) {
    return [];
  }
  const attributeIds = insight.conditions.map(({ attributeId }) => attributeId);
  const minSize = getMinSegmentSize(total.reached, options);
  const shown = index.groups.filter(
    (group) =>
      group.question === insight.question &&
      isSegmentOf(group, attributeIds) &&
      group.reached >= minSize,
  );
  const sign = isDescending(insight) ? -1 : 1;
  const segments = _.chain(shown)
    .map((group) => ({
      label: labelOf(group, attributeIds),
      values: valuesOf(group, attributeIds),
      reached: group.reached,
      converted: group.converted,
      ...(group.expected !== undefined ? { expected: group.expected } : {}),
      rate: rateOf(group),
    }))
    .sortBy("label")
    .sortBy(({ rate }) => sign * rate)
    .value();
  // From the total, not the small segments: pairs only count the values pass 2 kept.
  const other = shown.reduce<Counts>(subtractCounts, total);
  return other.reached > 0
    ? [
        ...segments,
        { label: OTHER_VALUE, values: [], ...other, rate: rateOf(other) },
      ]
    : segments;
};
