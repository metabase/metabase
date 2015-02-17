(ns metabase.api.result
  "/api/result/* endpoints representing saved Query executions."
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [query-execution :refer [QueryExecution all-fields]]
                             [database :refer [Database databases-for-org]]
                             [org :refer [Org]])))


(defendpoint GET "/:id" [id]
  (let-404 [{:keys [query_id] :as query-execution} (sel :one QueryExecution :id id)]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      query-execution)))


(defendpoint GET "/:id/response" [id]
  (let-404 [{:keys [query_id] :as query-execution} (eval `(sel :one ~all-fields :id ~id))]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read} :query data :result_data} (hydrate query-execution :query)]
      (check-403 @can_read)
      ;; NOTE - this builds the final response dictionary by piecing a few things together
      (-> (select-keys query-execution [:id :uuid :status])                                            ;; start with just the things we are sure to need
          (assoc :columns [] :data [])                                                                 ;; default columns/data
          (cond->
            (= "failed" (:status query-execution)) (assoc :error (:error query-execution)
                                                          :sql_error (:error query-execution))         ;; TODO - sql error formatting FN
            (= "completed" (:status query-execution)) (assoc :columns (get data :columns [])           ;; add real column & row data
                                                             :data (get data :rows [])))))))


(defendpoint GET "/:id/csv" [id]
  ;; TODO - this is actually a CSV instead of a JSON response!!
  {:status 999  ;; official http status code for "i'll do it later"
   :body "TODO"})


(define-routes)
