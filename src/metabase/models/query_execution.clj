(ns metabase.models.query-execution
  (:require [clojure.data.json :as json]
            [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [hydrate :refer [realize-json]]
                             [user :refer [User]]
                             [database :refer [Database]]
                             [query :refer [Query]])
            [metabase.util :refer :all]))


(defentity QueryExecution
  (table :query_queryexecution))

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

(defmethod pre-insert QueryExecution [_ {:keys [status json_query] :as query-execution}]
  (cond-> (assoc query-execution :json_query (if (string? json_query) json_query
                                                 (json/write-str json_query)))
    status (assoc :status (name status))))

(defmethod post-select QueryExecution [_ {:keys [query_id result_rows status] :as query-execution}]
  (-> query-execution
      (realize-json :json_query :result_data)
      (assoc* :status (keyword status)
              :row_count (or result_rows 0) ; sadly we have 2 ways to reference the row count :(
              :query (delay
                      (check query_id 500 "Can't get execution: QueryExecution doesn't have a :query_id.")
                      (sel :one Query :id query_id)))))


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
                (= "failed" (:status query-execution)) (assoc :error (:error query-execution)
                                                              ;; TODO - sql error formatting FN
                                                              :sql_error (:error query-execution))))))
