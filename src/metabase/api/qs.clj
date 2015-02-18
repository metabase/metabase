(ns metabase.api.qs
  (:require [clojure.data.csv :as csv]
            [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.util :refer [contains-many? now-iso8601]]
            (metabase.models
              [hydrate :refer :all]
              [query-execution :refer [all-fields]])))


(declare execute-query build-response)


(defendpoint POST "/" [:as {body :body}]
  (check-400 (contains-many? body :database :sql))
  ;; TODO - validate that database id is valid and user has perms on database
  (-> {:type "rawsql"
       :database (:database body)
       :rawsql {
                :sql (:sql body)
                :timezone (get body :timezone)
                }}
    (execute-query)
    ;; TODO - format the response of execute-query for the client
    ))


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


;; TODO - allow for asynchronous execution option
(defn execute-query
  "Run a single `native` type query against a database, optionally run asynchronously."
  [query]
  query
  ;; TODO - run the query on the database
  ;; TODO - build-response
  )


(defn build-response
  "Build a query response from a QueryExecution record."
  [{:keys [result_data] :as query-execution}]
  (->
    (select-keys query-execution [:id :uuid :status])                                            ;; start with just the things we are sure to need
    (assoc :columns [] :data [])                                                                 ;; default columns/data
    (cond->
      (= "failed" (:status query-execution)) (assoc :error (:error query-execution)              ;; add errors if we failed
                                                    :sql_error (:error query-execution))         ;; TODO - sql error formatting FN
      (= "completed" (:status query-execution)) (assoc :columns (get result_data :columns [])    ;; add real column & row data
                                                       :data (get result_data :rows [])))))