(ns metabase.queries.models.query-execution
  "QueryExecution is a log of very time a query is executed, and other information such as the User who executed it, run
  time, context it was executed in, etc."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(methodical/defmethod t2/table-name :model/QueryExecution [_model] :query_execution)

(derive :model/QueryExecution :metabase/model)
(derive :model/QueryExecution ::t2.disallow/update)

(t2/deftransforms :model/QueryExecution
  {:json_query mi/transform-json
   :lens_params mi/transform-json
   ;; no keywordization so login-attribute names round-trip untouched
   :sandbox_details mi/transform-json-no-keywordization
   :status     mi/transform-keyword
   :context    mi/transform-keyword})

;; Captures SDK info from dynamic vars. For the normal async QP path, SDK info is already in the map
;; (captured on-thread in `process-userland-query/save-execution-metadata!` before async handoff).
;; This hook serves as a safety net for any direct sync inserts.
(t2/define-before-insert :model/QueryExecution
  [query-execution]
  (analytics/include-sdk-info query-execution))

(t2/define-after-select :model/QueryExecution
  [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-query-executions! :- [:sequential ms/PositiveInt]
  "Insert the QueryExecution `rows` in a transaction of their own, so a row the app DB rejects does not abort the
  transaction of the caller, and return their ids in order."
  [rows :- [:sequential ::queries.schema/query-execution.create]]
  (if (empty? rows)
    []
    (queries.db/insert-query-executions! rows)))

(mu/defn delete-older-than! :- [:maybe :int]
  "Delete up to `batch-size` of the QueryExecutions whose `time-column` is at or before `cutoff`, in one statement, as the
  retention policy trims them; returns the number deleted."
  [time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (queries.db/delete-query-executions-before! time-column cutoff batch-size))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/QueryExecution [_model]
  {:skip? true})
