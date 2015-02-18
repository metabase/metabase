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

(defmethod pre-insert QueryExecution [_ {:keys [json_details] :as query-execution}]
  (assoc query-execution :json_query (if (string? json_details) json_details
                                        (json/write-str json_details))))

(defmethod post-select QueryExecution [_ {:keys [query_id] :as query-execution}]
  (-> query-execution
    (assoc :row_count (get query-execution :result_rows 0))  ;; sadly we have 2 ways to reference the row count :(
    (realize-json :json_query)
    (realize-json :result_data)
    (assoc* :query (delay
                     (check query_id 500 "Can't get execution: QueryExecution doesn't have a :query_id.")
                     (sel :one Query :id query_id)))))