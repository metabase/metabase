(ns metabase-enterprise.osi-generation.metrics
  "Prometheus emission for the OSI generation loop.

  The `:metabase-osi-generation/*` metric block lives in `metabase.analytics.prometheus`; this
  namespace is the thin call layer the loop uses so `core` does not depend on the metric names
  directly. Generation is not index reconciliation, so these are a separate prefix from
  `:metabase-entity-retrieval/*` — the embedding volume the run's trailing reconcile
  produces is read off `:metabase-entity-retrieval/docs-inserted` and the new
  `:metabase-search/semantic-embedding-requests` counter (labelled with the OSI source), not
  re-counted here."
  (:require
   [metabase.analytics-interface.core :as analytics]))

(set! *warn-on-reflection* true)

(defn record-candidate!
  "Count one candidate's terminal `outcome` for `entity-type`.

  `outcome` ∈ `#{:generated :restamped :skipped :error}` — the four summary counters the loop
  produces. `entity-type` is the candidate's model keyword (`:table`, `:card`, …)."
  [entity-type outcome]
  (analytics/inc! :metabase-osi-generation/candidates-processed
                  {:entity-type entity-type, :outcome outcome}))

(defn record-run!
  "End-of-run emission from the throttle `summary` and the loop's `pending-count`.

  Observes the run-duration and per-run token histograms, sets the backlog gauge from
  `pending-count`, and — when `summary`'s `:stopped-by` is non-nil — increments
  `budget-exhausted{limit=...}`. A nil `pending-count` means selection did not run, so the existing
  backlog gauge is preserved rather than overwritten with a fabricated zero."
  [{:keys [duration-ms input-tokens output-tokens stopped-by] :as _summary} pending-count]
  (analytics/observe! :metabase-osi-generation/run-duration-ms
                      {:outcome (if stopped-by "capped" "completed")}
                      (or duration-ms 0))
  (analytics/observe! :metabase-osi-generation/tokens-per-run {:kind "input"} (or input-tokens 0))
  (analytics/observe! :metabase-osi-generation/tokens-per-run {:kind "output"} (or output-tokens 0))
  (when (some? pending-count)
    (analytics/set-gauge! :metabase-osi-generation/candidates-pending nil pending-count))
  (when stopped-by
    (analytics/inc! :metabase-osi-generation/budget-exhausted {:limit stopped-by})))

(defn record-error!
  "Count a run that threw before completing (distinct from a per-candidate throw, which the loop
  isolates and counts as a `:error` candidate outcome). `error-type` is a short keyword classifier."
  [error-type]
  (analytics/inc! :metabase-osi-generation/run-errors {:error-type error-type}))
