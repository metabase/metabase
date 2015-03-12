(ns metabase.api.qs
  (:require [clojure.data.csv :as csv]
            [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [hydrate :refer :all]
                             [query-execution :refer [QueryExecution all-fields build-response]])
            [metabase.util :refer [contains-many? now-iso8601]]))


(declare execute-query build-response)


(defendpoint POST "/" [:as {{:keys [timezone database sql] :as body} :body}]
  (require-params database sql)
  (read-check Database database)
  (let [dataset-query {:type "native"
                       :database database
                       :native {:query sql
                                :timezone timezone}}
        options {:executed_by *current-user-id*
                 :synchronously false
                 :cache_result true}]
    (driver/dataset-query dataset-query options)))


(defendpoint GET "/:uuid" [uuid]
  (let-404 [query-execution (sel :one all-fields :uuid uuid)]
    (build-response query-execution)))


(defendpoint GET "/:uuid/csv" [uuid]
  (let-404 [{{:keys [columns rows]} :result_data} (sel :one all-fields :uuid uuid)]
    {:status 200
     :body (with-out-str
             (csv/write-csv *out* (into [columns] rows)))
     :headers {"Content-Type" "text/csv"
               "Content-Disposition" (str "attachment; filename=\"query_result_" (now-iso8601) ".csv\"")}}))

(define-routes)
