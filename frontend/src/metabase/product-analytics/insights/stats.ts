import type { Counts } from "./types";

/**
 * Complementary error function, with a relative error under 1.2e-7 everywhere
 * (Numerical Recipes' `erfcc`), so small p-values stay accurate.
 */
const erfc = (x: number): number => {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
};

/** Two-sided p-value of a standard normal statistic. */
const normalPValue = (z: number): number => erfc(Math.abs(z) / Math.SQRT2);

export const rateOf = ({ reached, converted }: Counts): number =>
  reached > 0 ? converted / reached : 0;

export const subtractCounts = (whole: Counts, part: Counts): Counts => ({
  reached: whole.reached - part.reached,
  converted: whole.converted - part.converted,
});

/**
 * Two-sided, pooled two-proportion z-test of whether `a` and `b` convert at
 * different rates. A p-value of 1 when either side is empty or the pooled
 * rate is 0 or 1.
 */
export const twoProportionPValue = (a: Counts, b: Counts): number => {
  if (a.reached <= 0 || b.reached <= 0) {
    return 1;
  }
  const pooled = (a.converted + b.converted) / (a.reached + b.reached);
  const standardError = Math.sqrt(
    pooled * (1 - pooled) * (1 / a.reached + 1 / b.reached),
  );
  if (standardError === 0) {
    return 1;
  }
  return normalPValue((rateOf(a) - rateOf(b)) / standardError);
};

/** Log-odds, with 0.5 added to each cell so empty cells stay finite. */
const logOdds = ({ reached, converted }: Counts) =>
  Math.log((converted + 0.5) / (reached - converted + 0.5));

const logOddsVariance = ({ reached, converted }: Counts) =>
  1 / (converted + 0.5) + 1 / (reached - converted + 0.5);

/**
 * Whether the effect of A on conversion depends on B, on the log-odds scale:
 * a two-sided Wald test of (A∧B − A∧¬B) − (¬A∧B − ¬A∧¬B).
 */
export const interactionPValue = ({
  both,
  onlyA,
  onlyB,
  neither,
}: Record<"both" | "onlyA" | "onlyB" | "neither", Counts>): number => {
  const cells = [both, onlyA, onlyB, neither];
  if (cells.some(({ reached }) => reached <= 0)) {
    return 1;
  }
  const interaction =
    logOdds(both) - logOdds(onlyA) - (logOdds(onlyB) - logOdds(neither));
  const standardError = Math.sqrt(
    cells.reduce((sum, cell) => sum + logOddsVariance(cell), 0),
  );
  return normalPValue(interaction / standardError);
};

/**
 * Benjamini–Hochberg: which of `pValues` are discoveries at false discovery
 * rate `q`. The result lines up with `pValues`.
 */
export const benjaminiHochberg = (
  pValues: readonly number[],
  q: number,
): boolean[] => {
  const m = pValues.length;
  const ranked = pValues
    .map((pValue, index) => ({ pValue, index }))
    .sort((a, b) => a.pValue - b.pValue);
  const cutoffRank = ranked.reduce(
    (cutoff, { pValue }, rank) =>
      pValue <= ((rank + 1) / m) * q ? rank + 1 : cutoff,
    0,
  );
  const isDiscovery = new Array<boolean>(m).fill(false);
  ranked
    .slice(0, cutoffRank)
    .forEach(({ index }) => (isDiscovery[index] = true));
  return isDiscovery;
};
