(ns metabase.explorations.models.exploration-query-result
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.explorations.db :as explorations.db]
   [metabase.interestingness.core :as interestingness]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationQueryResult [_model]
  :exploration_query_result)

(doto :model/ExplorationQueryResult
  (derive :metabase/model))

;; Every column here is encrypted at rest, and for one reason: each holds warehouse values, or prose
;; derived from them, produced under the creator's data-access lens. That is the same material as the
;; row blob in `stored_result.result_data`, which is encrypted too. `chart_stats` is easy to read as
;; mere shape and is not — the categorical stats carry each top category's `:name` straight from the
;; result rows (see [[metabase.interestingness.chart.categorical]]).
(t2/deftransforms :model/ExplorationQueryResult
  {:chart_stats        (mi/transform-encrypted-json-with-schema "exploration_query_result.chart_stats"
                                                                interestingness/chart-stats-schema)
   :metric_description (mi/transform-encrypted-text "exploration_query_result.metric_description")
   :chart_description  (mi/transform-encrypted-text "exploration_query_result.chart_description")})

(defn stored-results
  "Resolve the cached stored_result for an exploration_query_id via the EQR FK. Returns the
  full stored_result row (creator/db/blob/query) or nil when no result row exists yet (query
  still pending/errored)."
  [eq-id]
  (when-let [sr-id (explorations.db/query-result-stored-result-id eq-id)]
    (explorations.db/stored-result sr-id)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ExplorationQueryResult [_model]
  {:skip? true})
