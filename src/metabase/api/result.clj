(ns metabase.api.result
  "/api/result/* endpoints representing saved Query executions."
  (:require [clojure.data.csv :as csv]
            [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer [mapply]]
            (metabase.api [common :refer :all])
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database databases-for-org]]
                             [hydrate :refer :all]
                             [org :refer [Org]]
                             [query-execution :refer [QueryExecution all-fields build-response]])))


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
  (let-404 [{:keys [query_id] :as query-execution} (sel :one all-fields :id id)]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      (build-response query-execution))))


;; Returns the data response for a given query result as a CSV file
(defendpoint GET "/:id/csv" [id]
  (let-404 [{:keys [result_data query_id] :as query-execution} (sel :one all-fields :id id)]
    ;; NOTE - this endpoint requires there to be a saved query associated with this execution
    (check-404 query_id)
    (let-404 [{{can_read :can_read name :name} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      {:status 200
       :body (with-out-str (csv/write-csv *out* (into [(:columns result_data)] (:rows result_data))))
       :headers {"Content-Type" "text/csv"
                 "Content-Disposition" (str "attachment; filename=\"" name ".csv\"")}})))


(define-routes)
