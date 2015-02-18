(ns metabase.api.qs
  (:require [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.util :refer [contains-many?]]
            (metabase.models
              [hydrate :refer :all]
              [query-execution :refer [all-fields]])))


(declare execute-query)


(defendpoint POST "/" [:as {body :body}]
  (check-400 (contains-many? body :database :sql))
  ;; TODO - validate that database id is valid and user has perms on database
  (-> {:type "rawsql"
       :database (:database body)
       :rawsql {
                :sql (:sql body)
                :timezone (get body :timezone)
                }}
    (execute-query)))


;; TODO - not using defendpoint due to string params causing number format exceptions
(def query-result
  (GET "/:uuid" [uuid]
    (let-404 [{:keys [result_data] :as query-execution} (eval `(sel :one ~all-fields :uuid ~uuid))]
      ;; NOTE - this builds the final response dictionary by piecing a few things together
      (-> (select-keys query-execution [:id :uuid :status])                                          ;; start with just the things we are sure to need
        (assoc :columns [] :data [])                                                                 ;; default columns/data
        (cond->
          (= "failed" (:status query-execution)) (assoc :error (:error query-execution)
                                                        :sql_error (:error query-execution))         ;; TODO - sql error formatting FN
          (= "completed" (:status query-execution)) (assoc :columns (get result_data :columns [])    ;; add real column & row data
                                                           :data (get result_data :rows [])))
        (->> (assoc {:status 200} :body))))))


(defendpoint GET "/:query-uuid/csv" [query-uuid]
  ;; TODO - implementation (execute a query)
  {:TODO "TODO"})


(define-routes query-result)


;; ===============================================================================================================


;; TODO - allow for asynchronous execution option
(defn execute-query
  "Run a single `native` type query against a database, optionally run asynchronously."
  [query]
  query)