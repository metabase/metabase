(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require [clojure.data.csv :as csv]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer [structured-query?]]
            [metabase.models.card :refer [Card]]
            [metabase.models.database :refer [Database]]
            [metabase.models.hydrate :refer [hydrate]]
            [metabase.util :as u]))

(def ^:const api-max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:const api-max-results
  "General maximum number of rows to return from an API query."
  10000)

(def ^:const dataset-query-api-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  {:max-results           api-max-results
   :max-results-bare-rows api-max-results-bare-rows})

(defendpoint POST "/"
  "Execute an MQL query and retrieve the results as JSON."
  [:as {{:keys [database] :as body} :body}]
  (read-check Database database)
  ;; add sensible constraints for results limits on our query
  (let [query (assoc body :constraints dataset-query-api-constraints)]
    (driver/dataset-query query {:executed_by *current-user-id*})))


(defendpoint POST "/csv"
  "Execute an MQL query and download the result data as a CSV file."
  [query]
  {query [Required String->Dict]}
  (read-check Database (:database query))
  (let [{{:keys [columns rows]} :data :keys [status] :as response} (driver/dataset-query query {:executed_by *current-user-id*})
        columns (map name columns)] ; turn keywords into strings, otherwise we get colons in our output
    (if (= status :completed)
      ;; successful query, send CSV file
      {:status  200
       :body    (with-out-str
                  (csv/write-csv *out* (into [columns] rows)))
       :headers {"Content-Type" "text/csv; charset=utf-8"
                 "Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) ".csv\"")}}
      ;; failed query, send error message
      {:status 500
       :body   (:error response)})))


(defendpoint GET "/card/:id"
  "Execute the MQL query for a given `Card` and retrieve both the `Card` and the execution results as JSON.
   This is a convenience endpoint which simplifies the normal 2 api calls to fetch the `Card` then execute its query."
  [id]
  (let-404 [{:keys [dataset_query] :as card} (db/sel :one Card :id id)]
    (read-check card)
    (read-check Database (:database dataset_query))
    ;; add sensible constraints for results limits on our query
    ;; TODO: it would be nice to associate the card :id with the query execution tracking
    (let [query   (assoc dataset_query :constraints dataset-query-api-constraints)
          options {:executed_by *current-user-id*}]
      {:card   (hydrate card :creator)
       :result (driver/dataset-query query options)})))


(define-routes)
