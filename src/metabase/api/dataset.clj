(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [metabase
             [middleware :as middleware]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.api.common.internal :refer [route-fn-name]]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database]]
             [query :as query]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [java.io ByteArrayInputStream ByteArrayOutputStream]
           org.apache.poi.ss.usermodel.Cell))

;;; --------------------------------------------------- Constants ----------------------------------------------------

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


;;; -------------------------------------------- Running a Query Normally --------------------------------------------

(defn- query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`.
   Used so `:card-id` context can be passed along with the query so Collections perms checking is done if appropriate."
  [outer-query]
  (let [source-table (qputil/get-in-normalized outer-query [:query :source-table])]
    (when (string? source-table)
      (when-let [[_ card-id-str] (re-matches #"^card__(\d+$)" source-table)]
        (log/info (str "Source query for this query is Card " card-id-str))
        (u/prog1 (Integer/parseInt card-id-str)
          (api/read-check Card <>))))))

(api/defendpoint POST "/"
  "Execute a query and retrieve the results in the usual format."
  [:as {{:keys [database], :as query} :body}]
  {database s/Int}
  ;; don't permissions check the 'database' if it's the virtual database. That database doesn't actually exist :-)
  (when-not (= database database/virtual-id)
    (api/read-check Database database))
  ;; add sensible constraints for results limits on our query
  (let [source-card-id (query->source-card-id query)]
    (qp/process-query-and-save-execution! (assoc query :constraints default-query-constraints)
      {:executed-by api/*current-user-id*, :context :ad-hoc, :card-id source-card-id, :nested? (boolean source-card-id)})))


;;; ----------------------------------- Downloading Query Results in Other Formats -----------------------------------

;; add a generic implementation for the method that writes values to XLSX cells that just piggybacks off the
;; implementations we've already defined for encoding things as JSON. These implementations live in
;; `metabase.middleware`.
(defmethod spreadsheet/set-cell! Object [^Cell cell, value]
  (when (= (.getCellType cell) Cell/CELL_TYPE_FORMULA)
    (.setCellType cell Cell/CELL_TYPE_STRING))
  ;; stick the object in a JSON map and encode it, which will force conversion to a string. Then unparse that JSON and
  ;; use the resulting value as the cell's new String value. There might be some more efficient way of doing this but
  ;; I'm not sure what it is.
  (.setCellValue cell (str (-> (json/generate-string {:v value})
                               (json/parse-string keyword)
                               :v))))

(defn- export-to-xlsx [columns rows]
  (let [wb  (spreadsheet/create-workbook "Query result" (cons (mapv name columns) rows))
        ;; note: byte array streams don't need to be closed
        out (ByteArrayOutputStream.)]
    (spreadsheet/save-workbook! out wb)
    (ByteArrayInputStream. (.toByteArray out))))

(defn- export-to-csv [columns rows]
  (with-out-str
    ;; turn keywords into strings, otherwise we get colons in our output
    (csv/write-csv *out* (into [(mapv name columns)] rows))))

(defn- export-to-json [columns rows]
  (for [row rows]
    (zipmap columns row)))

(def ^:private export-formats
  {"csv"  {:export-fn    export-to-csv
           :content-type "text/csv"
           :ext          "csv"
           :context      :csv-download},
   "xlsx" {:export-fn    export-to-xlsx
           :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
           :ext          "xlsx"
           :context      :xlsx-download},
   "json" {:export-fn    export-to-json
           :content-type "applicaton/json"
           :ext          "json"
           :context      :json-download}})

(def ExportFormat
  "Schema for valid export formats for downloading query results."
  (apply s/enum (keys export-formats)))

(defn export-format->context
  "Return the `:context` that should be used when saving a QueryExecution triggered by a request to download results
  in EXPORT-FORAMT.

    (export-format->context :json) ;-> :json-download"
  [export-format]
  (or (get-in export-formats [export-format :context])
      (throw (Exception. (str "Invalid export format: " export-format)))))

(defn as-format
  "Return a response containing the RESULTS of a query in the specified format."
  {:style/indent 1, :arglists '([export-format results])}
  [export-format {{:keys [columns rows]} :data, :keys [status], :as response}]
  (api/let-404 [export-conf (export-formats export-format)]
    (if (= status :completed)
      ;; successful query, send file
      {:status  200
       :body    ((:export-fn export-conf) columns rows)
       :headers {"Content-Type"        (str (:content-type export-conf) "; charset=utf-8")
                 "Content-Disposition" (str "attachment; filename=\"query_result_" (u/date->iso-8601) "." (:ext export-conf) "\"")}}
      ;; failed query, send error message
      {:status 500
       :body   (:error response)})))

(def export-format-regex
  "Regex for matching valid export formats (e.g., `json`) for queries.
   Inteneded for use in an endpoint definition:

     (api/defendpoint POST [\"/:export-format\", :export-format export-format-regex]"
  (re-pattern (str "(" (str/join "|" (keys export-formats)) ")")))

(api/defendpoint POST ["/:export-format", :export-format export-format-regex]
  "Execute a query and download the result data as a file in the specified format."
  [export-format query]
  {query         su/JSONString
   export-format ExportFormat}
  (let [query (json/parse-string query keyword)]
    (api/read-check Database (:database query))
    (as-format export-format
      (qp/process-query-and-save-execution! (dissoc query :constraints)
        {:executed-by api/*current-user-id*, :context (export-format->context export-format)}))))


;;; ------------------------------------------------ Other Endpoints -------------------------------------------------

;; TODO - this is no longer used. Should we remove it?
(api/defendpoint POST "/duration"
  "Get historical query execution duration."
  [:as {{:keys [database], :as query} :body}]
  (api/read-check Database database)
  ;; try calculating the average for the query as it was given to us, otherwise with the default constraints if
  ;; there's no data there. If we still can't find relevant info, just default to 0
  {:average (or (query/average-execution-time-ms (qputil/query-hash query))
                (query/average-execution-time-ms (qputil/query-hash (assoc query :constraints default-query-constraints)))
                0)})

(api/define-routes
  (middleware/streaming-json-response (route-fn-name 'POST "/")))
