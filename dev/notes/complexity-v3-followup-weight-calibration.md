# Complexity score v3 follow-up — weight calibration

## Context

The per-variable weights in `metrics/{scale,nominal,semantic,structural}.clj`
are back-of-envelope v1 numbers extended to the new variables by analogy.
Specifically:

```
scale:     entity=10, field=1, collection=1
nominal:   name-collision=100, field-collision=5, repeated-measure=2
semantic:  synonym-pair=50
structural (proposed): join-cycle=20, inheritance-level=10, collection-depth-level=5
```

"100 vs 50 vs 20 vs 5 vs 2 vs 1" has no empirical grounding — it was chosen to
keep v3 totals close to v1 totals for the existing tier fixtures, not because
those ratios capture relative agent-difficulty impact.

This plan is a research-then-tune pass. The *code* change at the end is small
(update weight maps, re-pin tier fixture expected values, bump
`formula-version`). The work is the analysis.

Ships as a **formula-version bump** (v3 → v4). Downstream Snowplow cohorts
know v4 is a new scoring regime.

## Approach

1. **Assemble a calibration set.** 8–15 instances with enough variety:
   - stats appdb (one we already have analysis output for)
   - a few customer instances with explicit permission
   - a few synthetic instances spanning the "clean/small ← → sprawling/legacy" axis
   Enough variety that weights trained on this set generalize.

2. **Collect per-instance variable values.** Run the scorer at level 2 and
   dump the full `:variables` tree for each instance. No changes needed — the
   scorer already exposes everything. EDN output via the CLI is enough.

3. **Get a "ground truth" label per instance.** This is the hard part. Two
   options, in order of preference:

   A. **Agent-success proxy.** For instances where the MetaBot is actually
      deployed, compute the agent's disambiguation-failure rate (retries,
      user "wrong entity" signals, follow-up clarifications) over the
      trailing N days. Higher failure = higher difficulty. Pull from the
      existing AiUsageLog / MetaBot telemetry.
   B. **Human rating.** 1–5 difficulty rating per instance from someone who
      has actually used the agent on it. Cheaper to collect; more subjective.
      Fall back to this if (A) has too little signal per instance.

   Use (A) where available; pad with (B) only for instances where the agent
   isn't deployed or the telemetry is too sparse. Document which instance
   was rated by which method.

4. **Fit the weights.** Regress the ground-truth labels against the variable
   values. Constraints:
   - All scored variables get non-negative weights (adding difficulty is never
     protective).
   - Start from a small set: the currently-scored variables only. Descriptive
     variables (ratios, densities) are explanatory not additive.
   - Simple model first: linear regression with integer-rounded coefficients
     (weights need to be operator-interpretable, not floats). If R² is low,
     try adding interaction terms (e.g., `synonym-pairs × collection-depth`
     as a "hard-to-disambiguate in a deep tree" signal). Don't fit a tree or
     a neural net — interpretability is a hard constraint here.
   - If a variable's fitted weight is negative, set it to 0 (effectively drop
     from the score) and note that in the writeup. Don't invert its sign.

5. **Propose new weights + writeup.** Deliver:
   - A single patch that updates `weights` maps across the four `metrics/*`
     namespaces (structural if shipped by then).
   - Re-pinned expected values in `tier_fixtures_test.clj` (and the CLI
     fixture-1 test). Re-generate via REPL after the weight edit.
   - A short writeup alongside the existing
     `2026_04_21_data_analysis_summary.md` in
     `test_resources/semantic_layer/analysis/` with: calibration set, label
     methodology, fitted coefficients, and the integer-rounded values the
     patch actually ships.

## File-level changes (small)

- `metrics/scale.clj`, `metrics/nominal.clj`, `metrics/semantic.clj`,
  (optionally `metrics/structural.clj`): update `weights` maps.
- `complexity.clj`: bump `formula-version` to 4. Update the docstring above it
  noting v4's calibrated weights.
- `tier_fixtures_test.clj`, `cli_test.clj`: re-pin tier totals after REPL run.
- `test_resources/semantic_layer/analysis/<date>_weight_calibration.md`:
  new writeup.

## What not to change

- The variable set. Calibration only changes weights, not which variables are
  scored. If the data suggests a variable is useless (fitted weight near zero),
  dropping it is a *separate* discussion — don't conflate calibration with
  variable-set pruning.
- The dimension structure. Weights are per-variable, dimension sub-totals sum
  the weighted variables. Polarities (metadata inverted, everything else
  positive) are structural, not calibration-tuneable.
- Snowplow schema. `:score` field still exists, `:measurement` still carries
  the pre-score count. Only the numeric values change.

## Verification

1. Re-run full semantic-layer suite after the weight patch; it will red-fail
   on tier fixture totals until you re-pin them from the REPL.
2. Cross-check against the calibration set: the fitted scores should rank the
   instances in roughly the same order as the ground-truth labels (Spearman
   rank correlation ≥ 0.7 across the calibration set, eyeball).
3. Sanity check a few instances by hand: "does the v4 score agree with my
   qualitative sense of this instance's agent-difficulty better than v3 did?"

## Open questions before starting

- Is MetaBot telemetry rich enough right now to support approach (A) on
  enough instances? Check AiUsageLog fields and retention. If not, punt to
  (B) and note that v5 might redo this with better telemetry.
- Do we want per-dimension sub-totals to be comparable across instances? If
  yes, weights probably need normalizing per-dimension (e.g., scale, nominal,
  semantic, structural each calibrate to a shared 0–100 band). If no, keep
  raw weighted sums. My default: keep raw sums; add a derived `:normalized`
  view later if dashboards want one.
- Calibration set size: 8 instances is enough to pick up first-order effects
  but not interactions. 15+ would let us test interaction terms. Scale to
  what's available.

## Explicit non-goals

- No change to default `semantic-complexity-level`.
- No change to which variables are scored vs. descriptive. If calibration
  suggests e.g. `name-collisions-density` *should* be scored (because it
  predicts difficulty better than the raw count), that's a v5 conversation.
