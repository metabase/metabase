(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require [clojure.data.csv :as csv]
            [cheshire.core :as json]
            [compojure.core :refer [GET POST]]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase.api.common :refer :all]
            (toucan [db :as db]
                    [hydrate :refer [hydrate]])
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [query :as query]
                             [query-execution :refer [QueryExecution]])
            [metabase.query-processor :as qp]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.schema :as su]))

(def ^:private ^:const max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:private ^:const max-results
  "General maximum number of rows to return from an API query."
  10000)

(def ^:const default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  {:max-results           max-results
   :max-results-bare-rows max-results-bare-rows})

(defendpoint POST "/"
  "Execute a query and retrieve the results in the usual format."
  [:as {{:keys [database] :as body} :body}]
  (read-check Database database)
  ;; add sensible constraints for results limits on our query
  (let [query (assoc body :constraints default-query-constraints)]
    (qp/dataset-query query {:executed-by *current-user-id*, :context :ad-hoc})))

(defendpoint POST "/duration"
  "Get historical query execution duration."
  [:as {{:keys [database], :as query} :body}]
  (read-check Database database)
  ;; try calculating the average for the query as it was given to us, otherwise with the default constraints if there's no data there.
  ;; if we still can't find relevant info, just default to 0
  {:average (or (query/average-execution-time-ms (qputil/query-hash query))
                (query/average-execution-time-ms (qputil/query-hash (assoc query :constraints default-query-constraints)))
                0)})

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

(defn as-xlsx
  "Return an XLSX response containing the RESULTS of a query."
  {:arglists '([results])}
  [{{:keys [columns rows]} :data, :keys [status], :as response}]
  (if (= status :completed)
    ;; successful query, send XLSX file
    {:status  200
     :body    (let [wb (spreadsheet/create-workbook "Query result" (conj rows (mapv name columns)))
                    ; note: byte array streams don't need to be closed
                    out (java.io.ByteArrayOutputStream.)]
                (spreadsheet/save-workbook! out wb)
                (java.io.ByteArrayInputStream. (.toByteArray out)))
     :headers {"Content-Type" "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8"
               "Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) ".xlsx\"")}}
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
    (as-csv (qp/dataset-query (dissoc query :constraints) {:executed-by *current-user-id*, :context :csv-download}))))

(defendpoint POST "/xlsx"
  "Execute a query and download the result data as an XLSX file."
  [query]
  {query su/JSONString}
  (let [query (json/parse-string query keyword)]
    (read-check Database (:database query))
    (as-xlsx (qp/dataset-query (dissoc query :constraints) {:executed-by *current-user-id*, :context :xlsx-download}))))

(defendpoint POST "/json"
  "Execute a query and download the result data as a JSON file."
  [query]
  {query su/JSONString}
  (let [query (json/parse-string query keyword)]
    (read-check Database (:database query))
    (as-json (qp/dataset-query (dissoc query :constraints) {:executed-by *current-user-id*, :context :json-download}))))


(define-routes)
