(ns metabase.explorations.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting explorations-worker-count
  (deferred-tru "Number of concurrent background workers draining the explorations queue. Ignored on H2 (which is hardcoded to 1 because it lacks SKIP LOCKED).")
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false)

(defsetting explorations-query-planner
  (deferred-tru "Which planner picks charts for new explorations. `mechanical` (default) uses the deterministic matrix walk — one chart per applicable (metric, dimension) pair plus temporal-pattern and time-facet variants where eligible. `llm` forces the LLM planner (fails the run when no LLM is configured). `auto` uses the LLM-driven planner when an LLM is configured and falls back to the mechanical planner otherwise.")
  :type       :keyword
  :default    :mechanical
  :visibility :internal
  :export?    false)
