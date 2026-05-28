(ns metabase.metabot.quality.constants
  "Constants shared across the Metabot quality-score pipeline.

  Versioning, saturation constants, and the few hand-tuned ratios used by
  Layer 3 concern signals live here. Saturation constants in this MVP are
  *placeholders* — calibrated against representative fixtures during
  Phase 5, not derived from a real corpus. Re-tuning is by intent a
  follow-up and does not change the framework's defensibility.")

(set! *warn-on-reflection* true)

(def composite-version
  "Version stamp written into every persisted `quality_breakdown` and
  `quality_attribution` payload. Bumps on any change that would alter a
  previously-scored conversation's value."
  "v3.0")

;; ---- Saturation constants (placeholder; tuned in Phase 5) -----------------
;;
;; Each `C-*` constant is the count at which the corresponding signal hits
;; half of its asymptote under `x / (x + C)`. Smaller C → faster saturation,
;; harsher penalty for low counts. Values are first-pass guesses; Phase 5
;; calibrates against representative fixtures.

(def C-substitution
  "Saturation constant for Selection-quality's substitution-detection count
  under `s / (s + C-substitution)`."
  3.0)

(def C-grounding
  "Saturation constant for Grounding's ambiguous-bucket count under
  `|amb| / (|amb| + C-grounding)`."
  3.0)

(def C-rediscovery
  "Saturation constant for Discovery-efficiency's re-discovery count under
  `r / (r + C-rediscovery)`."
  3.0)

(def query-similarity-threshold
  "Normalized-Levenshtein similarity ≥ this value treats two query strings
  (or tool-argument blobs) as duplicates. Shared by thrash detection and
  re-discovery clustering — same metric, same threshold."
  0.8)

(def eh-mitigation-floor
  "Execution-health floor — even fully-mitigated errors still contribute
  `α · p` to the signal, since a clean conversation should not error at
  all. Used as `signal = p × (α + (1 − α) × u)`."
  0.5)

(def target-iterations-per-artifact
  "Conversational-economy's target ratio of total iterations to authored
  artifacts; iterations beyond this ratio saturate against the signal's
  saturation constant."
  3.0)

(def target-max-entity-reuse
  "Baseline reuse count above which max-per-entity reuse contributes to
  Conversational-economy."
  2)

(def C-thrash
  "Saturation constant for Conversational-economy's thrash-events count
  under `t / (t + C-thrash)`."
  3.0)

(def C-reuse
  "Saturation constant for Conversational-economy's max-per-entity
  reuse excess (over [[target-max-entity-reuse]]) under
  `excess / (excess + C-reuse)`."
  3.0)

(def C-economy-iterations
  "Saturation constant for Conversational-economy's iterations-per-artifact
  excess (over [[target-iterations-per-artifact]]) under
  `excess / (excess + C-economy-iterations)`."
  3.0)

(def typical-search-result-length
  "Search-tool result-list length used to normalize Discovery-efficiency's
  avg-rank-used component. Matches the search tool's default `:limit`
  parameter; the signal saturates at `1.0` when ranks consistently land
  at or beyond this position. Ranks are 0-based, so a list of 10 entries
  has max rank `9` — but normalizing by the inclusive list length keeps
  the math intuitive (`rank / length`)."
  10.0)

(def substitution-name-distance-threshold
  "Normalized Levenshtein distance ≤ this value treats two entity names
  as substitution candidates in Selection-quality. Looser than the
  thrash/rediscovery threshold (distance 0.3 ↔ similarity 0.7) because
  user-facing entity names tend to vary in their suffixes
  (`orders_2023` vs. `orders_2024`)."
  0.3)
