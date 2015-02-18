(ns metabase.api.result
  "/api/result/* endpoints representing saved Query executions."
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer [mapply]]
            (metabase.api [common :refer :all]
                          [qs :as qs])
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database databases-for-org]]
                             [hydrate :refer :all]
                             [org :refer [Org]]
                             [query-execution :refer [QueryExecution all-fields]])))


;; Returns the basic information about a given query result
(defendpoint GET "/:id" [id]
  (let-404 [{:keys [query_id] :as query-execution} (sel :one QueryExecution :id id)]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      query-execution)))


;; Returns the actual data response for a given query result (as if the query was just executed)
(defendpoint GET "/:id/response" [id]
  (let-404 [{:keys [query_id] :as query-execution} (eval `(sel :one ~all-fields :id ~id))]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      (qs/build-response query-execution))))


;; Returns the data response for a given query result as a CSV file
(defendpoint GET "/:id/csv" [id]
  ;; TODO - this is actually a CSV instead of a JSON response!!
  {:status 999  ;; official http status code for "i'll do it later"
   :body "TODO"})


(define-routes)
