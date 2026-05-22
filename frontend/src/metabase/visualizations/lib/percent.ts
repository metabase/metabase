import { roundFloat } from "metabase/utils/formatting/numbers";

/**
 * Rounds a list of shares (fractions in 0..1) to `decimals` percent decimal
 * places using the largest-remainder method, so the rounded parts
 * sum to exactly 100%.
 *
 * Only reconciles a *complete* whole: if the shares don't already round to 100%
 * at the given precision (e.g. a Sankey node with flow loss, a hidden-slice
 * subset, or nested-pie children that sum to their parent's share), the input is
 * returned unchanged so the caller rounds as usual.
 *
 * Order is significant: ties in the fractional remainder are awarded to the
 * first entry, so callers should pass shares in display order.
 */
export function reconcilePercentagesIfNeeded(
  shares: number[],
  decimals: number,
): number[] {
  if (
    typeof decimals !== "number" ||
    !Number.isFinite(decimals) ||
    decimals < 0
  ) {
    return [...shares];
  }
  if (shares.length === 0) {
    return [...shares];
  }

  const unitsPerWhole = 100 * Math.pow(10, decimals);
  const sanitized = shares.map((share) => (Number.isFinite(share) ? share : 0));
  // Round away floating-point noise before flooring
  const exactUnits = sanitized.map((share) =>
    roundFloat(share * unitsPerWhole, 9),
  );

  const exactTotal = exactUnits.reduce((sum, units) => sum + units, 0);
  if (Math.round(exactTotal) !== unitsPerWhole) {
    return [...shares];
  }

  const floorUnits = exactUnits.map((units) => Math.floor(units));
  const remainders = exactUnits.map(
    (units, index) => units - floorUnits[index],
  );
  const flooredTotal = floorUnits.reduce((sum, units) => sum + units, 0);
  const unitsToDistribute = Math.max(
    0,
    Math.min(shares.length, unitsPerWhole - flooredTotal),
  );

  if (unitsToDistribute > 0) {
    // Largest remainder first; ties go to the earlier index (first record wins).
    const order = exactUnits
      .map((_, index) => index)
      .sort((a, b) => remainders[b] - remainders[a] || a - b);
    for (let i = 0; i < unitsToDistribute; i++) {
      floorUnits[order[i]] += 1;
    }
  }

  return floorUnits.map((units) => units / unitsPerWhole);
}
