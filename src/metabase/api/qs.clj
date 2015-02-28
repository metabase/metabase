(ns metabase.api.qs
  (:require [clojure.data.csv :as csv]
            [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp]
            (metabase.models
              [hydrate :refer :all]
              [query-execution :refer [QueryExecution all-fields]])
            [metabase.util :refer [contains-many? now-iso8601]]))


(declare execute-query build-response)


(defendpoint POST "/" [:as {body :body}]
  (check-400 (contains-many? body :database :sql))
  ;; TODO - validate that database id is valid and user has perms on database
  ;; TODO - this needs to support async execution & cached results
  ;; TODO - currently the response format here is a little different than the normal dataset_query response
  (let [dataset-query {:type "native"
                       :database (:database body)
                       :native {:query (:sql body)
                                :timezone (get body :timezone)}}
        options {:synchronously false
                 :cache_result true}]
    (driver/dataset-query dataset-query options)))


;; TODO - not using defendpoint due to string params causing number format exceptions
(def query-result
  (GET "/:uuid" [uuid]
    (let-404 [query-execution (eval `(sel :one ~all-fields :uuid ~uuid))]
      (->>
        (build-response query-execution)
        (assoc {:status 200} :body)))))


(def query-result-csv
  (GET "/:uuid/csv" [uuid]
    (let-404 [{:keys [result_data] :as query-execution} (eval `(sel :one ~all-fields :uuid ~uuid))]
      {:status 200
       :body (with-out-str (csv/write-csv *out* (into [(:columns result_data)] (:rows result_data))))
       :headers {"Content-Type" "text/csv", "Content-Disposition" (str "attachment; filename=\"query_result_" (now-iso8601) ".csv\"")}})))


(define-routes query-result query-result-csv)


;; ===============================================================================================================


(defn build-response
  "Build a query response from a QueryExecution record."
  [{{:keys [cols columns rows data]
     :or {cols []
          columns []}} :result_data :as query-execution}]
  (->
    (select-keys query-execution [:id :uuid :status])
    (assoc :data {:rows (or rows data [])
                  :cols cols
                  :columns columns})
    (cond->
      (= "failed" (:status query-execution)) (assoc :error (:error query-execution)
                                                    ;; TODO - sql error formatting FN
                                                    :sql_error (:error query-execution)))))
