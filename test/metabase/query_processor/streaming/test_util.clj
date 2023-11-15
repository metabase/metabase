(ns metabase.query-processor.streaming.test-util
  "Utility functions for testing QP streaming (download) functionality."
  (:require
   [cheshire.core :as json]
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (java.io BufferedInputStream BufferedOutputStream ByteArrayInputStream ByteArrayOutputStream InputStream InputStreamReader)))

(set! *warn-on-reflection* true)

(defmulti ^:private parse-result*
  {:arglists '([export-format ^InputStream input-stream column-names])}
  (fn [export-format _ _] (keyword export-format)))

(defmethod parse-result* :api
  [_ ^InputStream is _]
  (with-open [reader (InputStreamReader. is)]
    (let [response (json/parse-stream reader true)]
      (cond-> response
        (map? response) (dissoc :database_id :started_at :json_query :average_execution_time :context :running_time)))))

(defmethod parse-result* :json
  [export-format is column-names]
  ((get-method parse-result* :api) export-format is column-names))

(defmethod parse-result* :csv
  [_ ^InputStream is _]
  (with-open [reader (InputStreamReader. is)]
    (doall (csv/read-csv reader))))

(defmethod parse-result* :xlsx
  [_ ^InputStream is column-names]
  (->> (spreadsheet/load-workbook-from-stream is)
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns (zipmap (map (comp keyword str char)
                                                (range (int \A) (inc (int \Z))))
                                           column-names))
       rest))

(defn parse-result
  ([export-format input-stream]
   (parse-result export-format input-stream ["ID" "Name" "Category ID" "Latitude" "Longitude" "Price"]))

  ([export-format input-stream column-names]
   (parse-result* export-format input-stream column-names)))

(defn process-query-basic-streaming
  "Process `query` and export it as `export-format` (in-memory), then parse the results."
  {:arglists '([export-format query] [export-format query column-names])}
  [export-format query & args]
  (with-open [bos (ByteArrayOutputStream.)
              os  (BufferedOutputStream. bos)]
    (qp.streaming/do-with-streaming-rff
     export-format os
     (fn [rff]
       (binding [qp.pipeline/*query-timeout-ms* (u/seconds->ms 15)]
         (is (=? {:status :completed}
                 (qp/process-query query rff))))))
    (.flush os)
    (let [bytea (.toByteArray bos)]
      (with-open [is (BufferedInputStream. (ByteArrayInputStream. bytea))]
        (apply parse-result export-format is args)))))

(defn process-query-api-response-streaming
  "Process `query` as an API request, exporting it as `export-format` (in-memory), then parse the results."
  {:arglists '([export-format query] [export-format query column-names])}
  [export-format query & args]
  (let [byytes (if (= export-format :api)
                 (mt/user-real-request :crowberto :post "dataset"
                                       {:request-options {:as :byte-array}}
                                       (assoc-in query [:middleware :js-int-to-string?] false))
                 (mt/user-real-request :crowberto :post (format "dataset/%s" (name export-format))
                                       {:request-options {:as :byte-array}}
                                       :query (json/generate-string query)))]
    (with-open [is (ByteArrayInputStream. byytes)]
      (apply parse-result export-format is args))))

(defmulti expected-results
  {:arglists '([export-format normal-results])}
  (fn [export-format _] (keyword export-format)))

(defmethod expected-results :api
  [_ normal-results]
  (mt/obj->json->obj normal-results))

(defmethod expected-results :json
  [_ normal-results]
  (let [{{:keys [cols rows]} :data} (mt/obj->json->obj normal-results)]
    (for [row rows]
      (zipmap (map (comp keyword :display_name) cols)
              row))))

(defmethod expected-results :csv
  [_ normal-results]
  (let [{{:keys [cols rows]} :data} normal-results]
    (cons (map :display_name cols)
          (for [row rows]
            (for [v row]
              (str v))))))

(defmethod expected-results :xlsx
  [_ normal-results]
  (let [{{:keys [cols rows]} :data} normal-results]
    (for [row rows]
      (zipmap (map :display_name cols)
              (for [v row]
                (if (number? v)
                  (double v)
                  v))))))
