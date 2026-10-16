import _ from "underscore";

import {
  OTHER_VALUE,
  SEGMENT_SEPARATOR,
} from "../sql/analyses/funnel-insights";

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
  rate: number;
};

/** People in a segment smaller than this are counted in `OTHER_VALUE`. */
export const getMinSegmentSize = (
  transitionReached: number,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): number => Math.ceil(getMinGroupSize(transitionReached, options));

/** Better-converting insights list the best segments first; worse ones, the worst. */
export const isDescending = (insight: Pick<Insight, "rate" | "restRate">) =>
  insight.rate > insight.restRate;

const isSegmentOf = (group: GroupCounts, attributeIds: readonly string[]) =>
  group.conditions.length === attributeIds.length &&
  attributeIds.every((attributeId) =>
    group.conditions.some((condition) => condition.attributeId === attributeId),
  );

const labelOf = (group: GroupCounts, attributeIds: readonly string[]) =>
  attributeIds
    .map(
      (attributeId) =>
        group.conditions.find(
          (condition) => condition.attributeId === attributeId,
        )?.value,
    )
    .join(SEGMENT_SEPARATOR);

/**
 * Conversion at the insight's transition by every combination of its
 * attributes' values, sorted by rate in the insight's direction. Segments too
 * small for a meaningful rate are pooled into a last `OTHER_VALUE` segment.
 */
export const getInsightSegments = (
  index: CountIndex,
  insight: Insight,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): InsightSegment[] => {
  const total = index.totals.get(insight.transition);
  if (total === undefined) {
    return [];
  }
  const attributeIds = insight.conditions.map(({ attributeId }) => attributeId);
  const minSize = getMinSegmentSize(total.reached, options);
  const shown = index.groups.filter(
    (group) =>
      group.transition === insight.transition &&
      isSegmentOf(group, attributeIds) &&
      group.reached >= minSize,
  );
  const sign = isDescending(insight) ? -1 : 1;
  const segments = _.chain(shown)
    .map((group) => ({
      label: labelOf(group, attributeIds),
      reached: group.reached,
      converted: group.converted,
      rate: rateOf(group),
    }))
    .sortBy("label")
    .sortBy(({ rate }) => sign * rate)
    .value();
  // From the total, not the small segments: pairs only count the values pass 2 kept.
  const other = shown.reduce<Counts>(subtractCounts, total);
  return other.reached > 0
    ? [...segments, { label: OTHER_VALUE, ...other, rate: rateOf(other) }]
    : segments;
};
