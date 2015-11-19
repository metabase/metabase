(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require [clojure.data.csv :as csv]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer [structured-query?]]
            [metabase.models.database :refer [Database]]
            [metabase.util :as u]))

(def ^:const api-max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:const api-max-results
  "General maximum number of rows to return from an API query."
  10000)


(defendpoint POST "/"
  "Execute an MQL query and retrieve the results as JSON."
  [:as {{:keys [database] :as body} :body}]
  (read-check Database database)
  ;; add sensible constraints for results limits on our query
  (let [query (assoc body :constraints {:max-results           api-max-results
                                        :max-results-bare-rows api-max-results-bare-rows})]
    (driver/dataset-query query {:executed_by *current-user-id*})))


(defendpoint GET "/csv"
  "Execute an MQL query and download the result data as a CSV file."
  [query]
  {query [Required String->Dict]}
  (read-check Database (:database query))
  (let [{{:keys [columns rows]} :data :keys [status] :as response} (driver/dataset-query query {:executed_by *current-user-id*})
        columns (map name columns)]                         ; turn keywords into strings, otherwise we get colons in our output
    (if (= status :completed)
      ;; successful query, send CSV file
      {:status 200
       :body (with-out-str
               (csv/write-csv *out* (into [columns] rows)))
       :headers {"Content-Type" "text/csv"
                 "Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) ".csv\"")}}
      ;; failed query, send error message
      {:status 500
       :body response})))

(define-routes)
