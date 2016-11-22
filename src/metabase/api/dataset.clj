(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require [clojure.data.csv :as csv]
            [cheshire.core :as json]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [hydrate :refer [hydrate]]
                             [query-execution :refer [QueryExecution]])
            (metabase [query-processor :as qp]
                      [util :as u])
            [metabase.util.schema :as su]))

(def ^:private ^:const max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:private ^:const max-results
  "General maximum number of rows to return from an API query."
  10000)

(def ^:const query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  {:max-results           max-results
   :max-results-bare-rows max-results-bare-rows})

(defendpoint POST "/"
  "Execute an MQL query and retrieve the results as JSON."
  [:as {{:keys [database] :as body} :body}]
  (read-check Database database)
  ;; add sensible constraints for results limits on our query
  (let [query (assoc body :constraints query-constraints)]
    (qp/dataset-query query {:executed-by *current-user-id*})))

(defendpoint POST "/duration"
  "Get historical query execution duration."
  [:as {{:keys [database] :as query} :body}]
  (read-check Database database)
  ;; add sensible constraints for results limits on our query
  (let [query         (assoc query :constraints query-constraints)
        running-times (db/select-field :running_time QueryExecution
                        :query_hash (hash query)
                        {:order-by [[:started_at :desc]]
                         :limit    10})]
    {:average (if (empty? running-times)
                0
                (float (/ (reduce + running-times)
                          (count running-times))))}))

(defn as-csv
  "Return a CSV response containing the RESULTS of a query."
  {:arglists '([results])}
  [{{:keys [columns rows]} :data, :keys [status], :as response}]
  (if (= status :completed)
    ;; successful query, send CSV file
    {:status  200
     :body    (with-out-str
                ;; turn keywords into strings, otherwise we get colons in our output
                (csv/write-csv *out* (into [(mapv name columns)] rows)))
     :headers {"Content-Type" "text/csv; charset=utf-8"
               "Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) ".csv\"")}}
    ;; failed query, send error message
    {:status 500
     :body   (:error response)}))

(defn as-json
  "Return a JSON response containing the RESULTS of a query."
  {:arglists '([results])}
  [{{:keys [columns rows]} :data, :keys [status], :as response}]
  (if (= status :completed)
    ;; successful query, send CSV file
    {:status  200
     :body    (for [row rows]
                (zipmap columns row))
     :headers {"Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) ".json\"")}}
    ;; failed query, send error message
    {:status 500
     :body   {:error (:error response)}}))

(defendpoint POST "/csv"
  "Execute a query and download the result data as a CSV file."
  [query]
  {query su/JSONString}
  (let [query (json/parse-string query keyword)]
    (read-check Database (:database query))
    (as-csv (qp/dataset-query query {:executed-by *current-user-id*}))))

(defendpoint POST "/json"
  "Execute a query and download the result data as a JSON file."
  [query]
  {query su/JSONString}
  (let [query (json/parse-string query keyword)]
    (read-check Database (:database query))
    (as-json (qp/dataset-query query {:executed-by *current-user-id*}))))


(define-routes)
