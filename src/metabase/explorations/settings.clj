(ns metabase.explorations.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(def valid-query-planners
  "The planners `explorations-query-planner` may name. Single source of truth: the setting's
   setter validates writes against this, and `query-plan/pick-planner!` asserts against it."
  #{:auto :llm :mechanical :adaptive})

(defsetting explorations-worker-count
  (deferred-tru "Number of concurrent background workers draining the explorations queue. Ignored on H2 (which is hardcoded to 1 because it lacks SKIP LOCKED).")
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false)

(defsetting explorations-query-planner
  (deferred-tru "Which planner picks charts for new explorations. `adaptive` (default) uses the greedy best-first loop — it emits the full mechanical matrix and layers gain-gated drilled survivors on top (no LLM call during search). `mechanical` uses the deterministic matrix walk — one chart per applicable (metric, dimension) pair plus temporal-pattern and time-facet variants where eligible. `llm` forces the LLM planner (fails the run when no LLM is configured). `auto` uses the LLM-driven planner when an LLM is configured and falls back to the mechanical planner otherwise.")
  :type       :keyword
  :default    :adaptive
  :visibility :internal
  :export?    false
  ;; Guard the write path: a bad explicit value coerces to the default rather than being
  ;; stored (an unknown value would otherwise force `pick-planner!` onto its fallback every
  ;; run). An env-var value bypasses this setter and is caught by `pick-planner!`'s default.
  :setter     (fn [new-value]
                (let [kw (some-> new-value keyword)]
                  (if (or (nil? kw) (valid-query-planners kw))
                    (setting/set-value-of-type! :keyword :explorations-query-planner kw)
                    (do (log/warnf "Invalid explorations-query-planner %s; keeping :adaptive (valid: %s)"
                                   (pr-str new-value) (pr-str valid-query-planners))
                        (setting/set-value-of-type! :keyword :explorations-query-planner :adaptive))))))
