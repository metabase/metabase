(ns metabase-enterprise.transform-optimizer.scoring
  "Deterministic mapping from a proposal set to an `optimization_degree`
  in [0, 100]. Server-side computed so the LLM doesn't have to self-calibrate.

  Rubric (from PLAN.md → Phase 2 → Optimization degree):

      optimization_degree = 100 - clamp(Σ weight(severity_i), 0, 100)

      weight(:high)   = 30
      weight(:medium) = 15
      weight(:low)    =  5

  Empty proposals ⇒ 100. The LLM is told to *not* invent low-impact rewrites
  just to look productive — that would deflate the score artificially. The
  validator here only computes the rubric; it does not police severity."
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private weights
  "Severity → score weight. Edit here, in one place, if the rubric is tuned."
  {:high   30
   :medium 15
   :low     5})

(defn- proposal-weight
  "Weight of a single proposal. Unknown severities count as `:low` — the
  scoring function is forgiving so a slightly-off LLM response still produces
  a sensible score rather than throwing."
  [{:keys [severity]}]
  (get weights (keyword severity) (:low weights)))

(mu/defn optimization-degree :- [:int {:min 0 :max 100}]
  "Compute the optimization degree of the original transform given the set of
  proposals the LLM produced. See namespace docstring for the rubric.

  `proposals` is a sequence of maps each containing at least
  `:severity ∈ #{:high :medium :low}`."
  [proposals :- [:maybe [:sequential map?]]]
  (let [penalty (reduce + 0 (map proposal-weight proposals))]
    (max 0 (- 100 (min 100 penalty)))))
