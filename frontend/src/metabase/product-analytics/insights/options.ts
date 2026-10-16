export type InsightOptions = {
  /** The smallest group reported, in people. */
  minGroupSize: number;
  /** The smallest group reported, as a share of the people at the transition. */
  minGroupFraction: number;
  /** Conversions and drop-offs each side needs for the normal approximation to hold. */
  minOutcomes: number;
  /** Benjamini–Hochberg q: roughly the share of reported insights expected to be noise. */
  falseDiscoveryRate: number;
  /** Significance for the checks that a group adds something beyond a related group. */
  relatedGroupAlpha: number;
  /** A pair covering more of a parent than this is the same people as the parent. */
  maxParentCoverage: number;
  /** Values kept per attribute for pairs, largest first. */
  maxValuesPerAttribute: number;
  /** The most rows the pairs query may return. */
  pairRowBudget: number;
};

export const DEFAULT_INSIGHT_OPTIONS: InsightOptions = {
  minGroupSize: 100,
  minGroupFraction: 0.01,
  minOutcomes: 10,
  falseDiscoveryRate: 0.1,
  relatedGroupAlpha: 0.05,
  maxParentCoverage: 0.95,
  maxValuesPerAttribute: 20,
  pairRowBudget: 50_000,
};

/** The smallest group reported at a transition with `reached` people. */
export const getMinGroupSize = (
  reached: number,
  options: InsightOptions,
): number => Math.max(options.minGroupSize, options.minGroupFraction * reached);
