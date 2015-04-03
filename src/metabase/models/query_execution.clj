(ns metabase.models.query-execution
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [database :refer [Database]]
                             [query :refer [Query]])))


(defentity QueryExecution
  (table :query_queryexecution)
  (types {:json_query  :json
          :result_data :json
          :status      :keyword}))

(def all-fields [QueryExecution
                 :id
                 :uuid
                 :version
                 :json_query
                 :raw_query
                 :status
                 :started_at
                 :finished_at
                 :running_time
                 :error
                 :result_file
                 :result_rows
                 :result_data
                 :query_id])

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
   :result_rows
   :query_id])

(defmethod post-select QueryExecution [_ {:keys [query_id result_rows] :as query-execution}]
  (assoc query-execution
         :row_count (or result_rows 0) ; sadly we have 2 ways to reference the row count :(
         :query     (delay (check query_id 500 "Can't get execution: QueryExecution doesn't have a :query_id.")
                           (sel :one Query :id query_id))))

(defn build-response
    "Build a query response from a QueryExecution record."
    [{{:keys [cols columns rows data]
       :or {cols []
            columns []}} :result_data :as query-execution}]
    (let [rows (or rows data [])]
        (-> (select-keys query-execution [:id :uuid :status])
            (assoc :data {:rows rows
                          :cols cols
                          :columns columns}
                   :row_count (count rows))
            (cond->
                (= :failed (:status query-execution)) (assoc :error (:error query-execution)
                                                             :sql_error (:error query-execution))))))
