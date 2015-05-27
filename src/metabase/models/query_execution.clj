(ns metabase.models.query-execution
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [database :refer [Database]])))


(defentity QueryExecution
  (table :query_queryexecution)
  (types {:json_query  :json
          :result_data :json
          :status      :keyword}))

;; default fields to return for `sel QueryExecution
;; specifically excludes stored data columns
(defmethod default-fields QueryExecution [_]
  [:id
   :uuid
   :version
   :json_query
   :raw_query
   :status
   :started_at
   :finished_at
   :running_time
   :error
   :result_rows])

(defmethod post-select QueryExecution [_ {:keys [result_rows] :as query-execution}]
  (assoc query-execution
         :row_count (or result_rows 0))) ; sadly we have 2 ways to reference the row count :(
