(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase.query-processor :as qp]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import [java.io BufferedInputStream BufferedOutputStream ByteArrayInputStream ByteArrayOutputStream InputStream
            InputStreamReader]))

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
    (is (= :completed
           (:status (qp/process-query query (assoc (qp.streaming/streaming-context export-format os)
                                                   :timeout 15000)))))
    (.flush os)
    (let [bytea (.toByteArray bos)]
      (with-open [is (BufferedInputStream. (ByteArrayInputStream. bytea))]
        (apply parse-result export-format is args)))))

(defn process-query-api-response-streaming
  "Process `query` as an API request, exporting it as `export-format` (in-memory), then parse the results."
  {:arglists '([export-format query] [export-format query column-names])}
  [export-format query & args]
  (let [byytes (if (= export-format :api)
                 (mt/user-http-request :crowberto :post "dataset"
                                       {:request-options {:as :byte-array}}
                                       (assoc-in query [:middleware :js-int-to-string?] false))
                 (mt/user-http-request :crowberto :post (format "dataset/%s" (name export-format))
                                       {:request-options {:as :byte-array}}
                                       :query (json/generate-string query)))]
    (with-open [is (ByteArrayInputStream. byytes)]
      (apply parse-result export-format is args))))

(defmulti ^:private expected-results
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

(defn- maybe-remove-checksum
  "remove metadata checksum if present because it can change between runs if encryption is in play"
  [x]
  (cond-> x
    (map? x) (m/dissoc-in [:data :results_metadata :checksum])))

(defn- expected-results* [export-format query]
  (maybe-remove-checksum (expected-results export-format (qp/process-query query))))

(defn- basic-actual-results* [export-format query]
  (maybe-remove-checksum (process-query-basic-streaming export-format query)))

(deftest basic-streaming-test []
  (testing "Test that the underlying qp.streaming context logic itself works correctly. Not an end-to-end test!"
    (let [query (mt/mbql-query venues
                  {:order-by [[:asc $id]]
                   :limit    5})]
      (doseq [export-format (qp.streaming/export-formats)]
        (testing (u/colorize :yellow export-format)
          (is (= (expected-results* export-format query)
                 (basic-actual-results* export-format query))))))))

(defn- actual-results* [export-format query]
  (maybe-remove-checksum (process-query-api-response-streaming export-format query)))

(defn- compare-results [export-format query]
  (is (= (expected-results* export-format query)
         (actual-results* export-format query))))

(deftest streaming-response-test
  (testing "Test that the actual results going thru the same steps as an API response are correct."
    (doseq [export-format (qp.streaming/export-formats)]
      (testing (u/colorize :yellow export-format)
        (compare-results export-format (mt/mbql-query venues {:limit 5}))))))

(deftest utf8-test
  ;; UTF-8 isn't currently working for XLSX -- fix me
  (doseq [export-format (disj (qp.streaming/export-formats) :xlsx)]
    (testing (u/colorize :yellow export-format)
      (testing "Make sure our various streaming formats properly write values as UTF-8."
        (testing "A query that will have a little → in its name"
          (compare-results export-format (mt/mbql-query venues
                                           {:fields   [$name $category_id->categories.name]
                                            :order-by [[:asc $id]]
                                            :limit    5})))
        (testing "A query with emoji and other fancy unicode"
          (let [[sql & args] (db/honeysql->sql {:select [["Cam 𝌆 Saul 💩" :cam]]})]
            (compare-results export-format (mt/native-query {:query  sql
                                                             :params args}))))))))

(defmulti ^:private first-row-map
  "Return the first row in `results` as a map with `col-names` as the keys."
  {:arglists '([export-format results col-names])}
  (fn [export-format _ _] export-format))

(defmethod first-row-map :default
  [_ results _]
  results)

(defmethod first-row-map :api
  [_ results col-names]
  (zipmap col-names (mt/first-row results)))

(defmethod first-row-map :xlsx
  [_ results _]
  (first results))

(defmethod first-row-map :csv
  [_ [_ row] col-names]
  (zipmap col-names row))

(defmethod first-row-map :json
  [_ [row] col-names]
  ;; this only works if the map is small enough that it's an still an array map and thus preserving the original order
  (zipmap col-names (vals row)))

;; see also `metabase.query-processor.streaming.xlsx-test/report-timezone-test`
(deftest report-timezone-test
  (testing "Export downloads should format stuff with the report timezone rather than UTC (#13677)\n"
    (mt/test-driver :postgres
      (let [query     (mt/dataset attempted-murders
                        (mt/mbql-query attempts
                          {:fields   [$date $datetime $datetime_ltz $datetime_tz $datetime_tz_id $time $time_ltz $time_tz]
                           :order-by [[:asc $id]]
                           :limit    1}))
            col-names [:date :datetime :datetime-ltz :datetime-tz :datetime-tz-id :time :time-ltz :time-tz]]
        (doseq [export-format (qp.streaming/export-formats)]
          (letfn [(test-results [expected]
                    (testing (u/colorize :yellow export-format)
                      (is (= expected
                             (as-> (process-query-api-response-streaming export-format query col-names) results
                               (first-row-map export-format results col-names))))))]
            (testing "UTC results"
              (test-results
               (case export-format
                 (:csv :json)
                 {:date           "2019-11-01"
                  :datetime       "2019-11-01T00:23:18.331"
                  :datetime-ltz   "2019-11-01T07:23:18.331Z"
                  :datetime-tz    "2019-11-01T07:23:18.331Z"
                  :datetime-tz-id "2019-11-01T07:23:18.331Z"
                  :time           "00:23:18.331"
                  :time-ltz       "07:23:18.331Z"
                  :time-tz        "07:23:18.331Z"}

                 :api
                 {:date           "2019-11-01T00:00:00Z"
                  :datetime       "2019-11-01T00:23:18.331Z"
                  :datetime-ltz   "2019-11-01T07:23:18.331Z"
                  :datetime-tz    "2019-11-01T07:23:18.331Z"
                  :datetime-tz-id "2019-11-01T07:23:18.331Z"
                  :time           "00:23:18.331Z"
                  :time-ltz       "07:23:18.331Z"
                  :time-tz        "07:23:18.331Z"}

                 :xlsx
                 {:date           #inst "2019-11-01T00:00:00.000-00:00"
                  :datetime       #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-ltz   #inst "2019-11-01T07:23:18.331-00:00"
                  :datetime-tz    #inst "2019-11-01T07:23:18.331-00:00"
                  :datetime-tz-id #inst "2019-11-01T07:23:18.331-00:00"
                  ;; Excel actually displays these without the date info (which is zero), but since Docjure returns
                  ;; java.util.Dates by default when parsing an XLSX doc, they have the date info here.
                  :time           #inst "1899-12-31T00:23:18.000-00:00"
                  :time-ltz       #inst "1899-12-31T07:23:18.000-00:00"
                  :time-tz        #inst "1899-12-31T07:23:18.000-00:00"})))
            (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
              (test-results
               (case export-format
                 (:csv :json)
                 {:date           "2019-11-01"
                  :datetime       "2019-11-01T00:23:18.331"
                  :datetime-ltz   "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz    "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz-id "2019-11-01T00:23:18.331-07:00"
                  :time           "00:23:18.331"
                  :time-ltz       "23:23:18.331-08:00"
                  :time-tz        "23:23:18.331-08:00"}

                 :api
                 {:date           "2019-11-01T00:00:00-07:00"
                  :datetime       "2019-11-01T00:23:18.331-07:00"
                  :datetime-ltz   "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz    "2019-11-01T00:23:18.331-07:00"
                  :datetime-tz-id "2019-11-01T00:23:18.331-07:00"
                  :time           "00:23:18.331-08:00"
                  :time-ltz       "23:23:18.331-08:00"
                  :time-tz        "23:23:18.331-08:00"}

                 :xlsx
                 {:date           #inst "2019-11-01T00:00:00.000-00:00"
                  :datetime       #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-ltz   #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-tz    #inst "2019-11-01T00:23:18.331-00:00"
                  :datetime-tz-id #inst "2019-11-01T00:23:18.331-00:00"
                  :time           #inst "1899-12-31T00:23:18.000-00:00"
                  :time-ltz       #inst "1899-12-31T23:23:18.000-00:00"
                  :time-tz        #inst "1899-12-31T23:23:18.000-00:00"})))))))))
