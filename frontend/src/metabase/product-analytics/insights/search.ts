import _ from "underscore";

import type { CountIndex } from "./counts";
import {
  DEFAULT_INSIGHT_OPTIONS,
  type InsightOptions,
  getMinGroupSize,
} from "./options";
import {
  benjaminiHochberg,
  differencePValue,
  expectedPValue,
  interactionPValue,
  rateOf,
  subtractCounts,
  twoProportionPValue,
} from "./stats";
import type { Counts, GroupCounts, Insight, InsightCondition } from "./types";

/**
 * The z-test's normal approximation depends on the counts expected under the
 * pooled rate, not the observed ones, so a group that converts 0% of the time
 * can still be compared.
 */
const hasEnoughPeople = (
  counts: Counts,
  pooledRate: number,
  minSize: number,
  options: InsightOptions,
): boolean =>
  counts.reached >= minSize &&
  counts.reached * pooledRate >= options.minExpectedOutcomes &&
  counts.reached * (1 - pooledRate) >= options.minExpectedOutcomes;

/**
 * The group compared with everyone else at its question, or with expected
 * outcomes, with what's expected of its actors. `null` when either side is
 * too small to compare.
 */
export const evaluateGroup = (
  group: GroupCounts,
  total: Counts,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): Insight | null => {
  const rest = subtractCounts(total, group);
  const minSize = getMinGroupSize(total.reached, options);
  const pooledRate = rateOf(total);
  if (
    !hasEnoughPeople(group, pooledRate, minSize, options) ||
    !hasEnoughPeople(rest, pooledRate, minSize, options)
  ) {
    return null;
  }
  const rate = rateOf(group);
  const restRate =
    group.expected !== undefined
      ? group.expected.outcomes / group.reached
      : rateOf(rest);
  return {
    ...group,
    rate,
    restRate,
    excess: group.reached * (rate - restRate),
    pValue:
      group.expected !== undefined
        ? expectedPValue(group)
        : twoProportionPValue(group, rest),
  };
};

const isSameCondition = (a: InsightCondition, b: InsightCondition): boolean =>
  a.attributeId === b.attributeId && a.value === b.value;

const containsAll = (
  conditions: readonly InsightCondition[],
  subset: readonly InsightCondition[],
): boolean =>
  subset.every((item) =>
    conditions.some((other) => isSameCondition(item, other)),
  );

const evaluateGroups = (
  groups: readonly GroupCounts[],
  index: CountIndex,
  options: InsightOptions,
): Insight[] =>
  groups.flatMap((group) => {
    const total = index.totals.get(group.question);
    const insight =
      total !== undefined ? evaluateGroup(group, total, options) : null;
    return insight !== null ? [insight] : [];
  });

const discoveries = (
  candidates: readonly Insight[],
  options: InsightOptions,
): Insight[] => {
  const isDiscovery = benjaminiHochberg(
    candidates.map(({ pValue }) => pValue),
    options.falseDiscoveryRate,
  );
  return candidates.filter((_candidate, i) => isDiscovery[i]);
};

/**
 * How likely the combination's effect is chance, beyond its two attributes on
 * their own. Undefined when the pair is (almost) the same people as a parent.
 */
const interactionPValueOf = (
  pair: Insight,
  index: CountIndex,
  options: InsightOptions,
): number | undefined => {
  const [a, b] = pair.conditions;
  const total = index.totals.get(pair.question);
  const parentA = index.get(pair.question, [a]);
  const parentB = index.get(pair.question, [b]);
  if (total === undefined || parentA === undefined || parentB === undefined) {
    return undefined;
  }
  const isNarrower =
    pair.reached < options.maxParentCoverage * parentA.reached &&
    pair.reached < options.maxParentCoverage * parentB.reached;
  if (!isNarrower) {
    return undefined;
  }
  return interactionPValue({
    both: pair,
    onlyA: subtractCounts(parentA, pair),
    onlyB: subtractCounts(parentB, pair),
    neither: subtractCounts(
      subtractCounts(total, parentA),
      subtractCounts(parentB, pair),
    ),
  });
};

/**
 * A pair has to differ from everyone else and interact, so its p-value is the
 * larger of the two.
 */
const withInteraction = (
  pairs: readonly Insight[],
  index: CountIndex,
  options: InsightOptions,
): Insight[] =>
  pairs.flatMap((pair) => {
    const interaction = interactionPValueOf(pair, index, options);
    return interaction !== undefined
      ? [{ ...pair, pValue: Math.max(pair.pValue, interaction) }]
      : [];
  });

/**
 * The people in both groups, when the counts can tell. With three distinct
 * conditions only pairs are counted, so it's only known when the lower bound
 * |X∩Y∩Z| ≥ |X∩Z| + |Y∩Z| − |Z| shows the smaller group is inside the other.
 */
const overlapOf = (
  a: Insight,
  b: Insight,
  index: CountIndex,
  options: InsightOptions,
): Counts | undefined => {
  if (containsAll(b.conditions, a.conditions)) {
    return b;
  }
  if (containsAll(a.conditions, b.conditions)) {
    return a;
  }
  const conditions = _.uniq([...a.conditions, ...b.conditions], false, (item) =>
    JSON.stringify([item.attributeId, item.value]),
  );
  const hasConflict = conditions.some((item, i) =>
    conditions
      .slice(i + 1)
      .some((other) => other.attributeId === item.attributeId),
  );
  if (hasConflict) {
    return { reached: 0, converted: 0 };
  }
  if (conditions.length === 2) {
    return index.get(a.question, conditions);
  }
  if (conditions.length !== 3) {
    return undefined;
  }
  const lowerBound = Math.max(
    ...conditions.map((z) => {
      const [x, y] = conditions.filter((item) => item !== z);
      const xz = index.get(a.question, [x, z]);
      const yz = index.get(a.question, [y, z]);
      const zOnly = index.get(a.question, [z]);
      return xz !== undefined && yz !== undefined && zOnly !== undefined
        ? xz.reached + yz.reached - zOnly.reached
        : 0;
    }),
  );
  const smaller = a.reached <= b.reached ? a : b;
  return lowerBound >= options.maxParentCoverage * smaller.reached
    ? smaller
    : undefined;
};

/**
 * Whether `other` accounts for `insight`: among the people outside `other`,
 * `insight` converts like everyone else. When `insight` is (almost) inside
 * `other`, it's whether it converts like the rest of `other`. With expected
 * outcomes, "converts like" is beating what's expected by as much.
 */
const isExplainedBy = (
  insight: Insight,
  other: Insight,
  index: CountIndex,
  options: InsightOptions,
): boolean => {
  const total = index.totals.get(insight.question);
  if (
    other === insight ||
    other.question !== insight.question ||
    total === undefined
  ) {
    return false;
  }
  const overlap = overlapOf(insight, other, index, options);
  if (overlap === undefined) {
    return false;
  }
  const outsideOther = subtractCounts(insight, overlap);
  if (outsideOther.reached < getMinGroupSize(total.reached, options)) {
    return (
      differencePValue(insight, subtractCounts(other, overlap)) >=
      options.relatedGroupAlpha
    );
  }
  const neither = subtractCounts(
    subtractCounts(total, insight),
    subtractCounts(other, overlap),
  );
  return differencePValue(outsideOther, neither) >= options.relatedGroupAlpha;
};

/**
 * Groups whose conversion differs significantly from everyone else's at the
 * same question, strongest first by |excess|.
 *
 * Singles and pairs are separate Benjamini–Hochberg families, so the singles
 * found don't change when pairs arrive. A pair's p-value covers both its
 * difference from everyone else and its interaction. An insight another one
 * accounts for is left out; when two account for each other, the narrower
 * one stays.
 */
export const findInsights = (
  index: CountIndex,
  options: InsightOptions = DEFAULT_INSIGHT_OPTIONS,
): Insight[] => {
  const singles = discoveries(
    evaluateGroups(
      index.groups.filter(({ conditions }) => conditions.length === 1),
      index,
      options,
    ),
    options,
  );
  const pairs = discoveries(
    withInteraction(
      evaluateGroups(
        index.groups.filter(({ conditions }) => conditions.length === 2),
        index,
        options,
      ),
      index,
      options,
    ),
    options,
  );

  // Ties are groups of the same people, like several traits that are all
  // empty before someone is identified. The earlier attribute ranks first.
  const attributeOrder = ({ conditions }: Insight) =>
    index.singleAttributes.indexOf(conditions[0].attributeId);
  const ranked = [...singles, ...pairs].sort(
    (a, b) =>
      Math.abs(b.excess) - Math.abs(a.excess) ||
      attributeOrder(a) - attributeOrder(b),
  );
  const explains = (other: Insight, insight: Insight) =>
    isExplainedBy(insight, other, index, options);
  // Of two that account for each other, like the two values of a yes/no
  // column, the narrower one says more.
  const isPreferred = (
    insight: Insight,
    rank: number,
    other: Insight,
    otherRank: number,
  ) =>
    insight.reached !== other.reached
      ? insight.reached < other.reached
      : rank < otherRank;

  return ranked.filter((insight, rank) =>
    ranked.every(
      (other, otherRank) =>
        !explains(other, insight) ||
        (explains(insight, other) &&
          isPreferred(insight, rank, other, otherRank)),
    ),
  );
};
