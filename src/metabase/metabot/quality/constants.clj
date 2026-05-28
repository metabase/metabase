(ns metabase.metabot.quality.constants
  "Constants shared across the Metabot quality-score pipeline.")

(set! *warn-on-reflection* true)

(def composite-version
  "Version stamp written into every persisted `quality_breakdown` and
  `quality_attribution` payload. Bumps on any change that would alter a
  previously-scored conversation's value."
  "v3.0")

(def jaccard-threshold
  "Two search calls whose result-id sets overlap at or above this Jaccard
  ratio are treated as the same retrieval."
  0.5)
