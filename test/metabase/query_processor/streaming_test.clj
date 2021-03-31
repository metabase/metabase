(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase.models :refer [Card]]
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
    (json/parse-stream reader true)))

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
  (mt/with-temp Card [card {:dataset_query query}]
    (let [byytes (mt/user-http-request :crowberto :post
                                       (if (= export-format :api)
                                         (format "card/%d/query" (u/the-id card))
                                         (format "card/%d/query/%s" (u/the-id card) (name export-format)))
                                       {:request-options {:as :byte-array}})]
      (with-open [is (ByteArrayInputStream. byytes)]
        (apply parse-result export-format is args)))))

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
        (testing export-format
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
      (testing export-format
        (compare-results export-format (mt/mbql-query venues {:limit 5}))))))

(deftest utf8-test
  ;; UTF-8 isn't currently working for XLSX -- fix me
  (doseq [export-format (disj (qp.streaming/export-formats) :xlsx)]
    (testing export-format
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
  [_ [row] _]
  row)

;; see also `metabase.query-processor.streaming.xlsx-test/report-timezone-test`
(deftest report-timezone-test
  (testing "Export downloads should format stuff with the report timezone rather than UTC (#13677)\n"
    (mt/test-driver :postgres
      (let [sql       (str "select  '2021-01-25'::date,"
                           " date_trunc('day', '2021-01-25'::date) as day,"
                           " date_trunc('week', '2021-01-25'::date) as week,"
                           " date_trunc('month', '2021-01-25'::date) as month,"
                           " date_trunc('quarter', '2021-01-25'::date) as quarter,"
                           " current_setting('TIMEZONE') AS tz")
            query     {:database (mt/id), :type :native, :native {:query sql}}
            col-names [:date :day :week :month :quarter :tz]]
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
                 {:date    "2021-01-25"
                  :day     "2021-01-25"
                  :week    "2021-01-25"
                  :month   "2021-01-01"
                  :quarter "2021-01-01"
                  :tz      "UTC"}

                 :api
                 {:date    "2021-01-25T00:00:00Z"
                  :day     "2021-01-25T00:00:00Z"
                  :week    "2021-01-25T00:00:00Z"
                  :month   "2021-01-01T00:00:00Z"
                  :quarter "2021-01-01T00:00:00Z"
                  :tz      "UTC"}

                 :xlsx
                 {:date    #inst "2021-01-25T00:00:00.000-00:00"
                  :day     #inst "2021-01-25T00:00:00.000-00:00"
                  :week    #inst "2021-01-25T00:00:00.000-00:00"
                  :month   #inst "2021-01-01T00:00:00.000-00:00"
                  :quarter #inst "2021-01-01T00:00:00.000-00:00"
                  :tz      "UTC"})))
            (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
              (test-results
               (case export-format
                 (:csv :json)
                 {:date    "2021-01-25"
                  :day     "2021-01-25"
                  :week    "2021-01-25"
                  :month   "2021-01-01"
                  :quarter "2021-01-01"
                  :tz      "US/Pacific"}

                 :api
                 {:date    "2021-01-25T00:00:00-08:00"
                  :day     "2021-01-25T00:00:00-08:00"
                  :week    "2021-01-25T00:00:00-08:00"
                  :month   "2021-01-01T00:00:00-08:00"
                  :quarter "2021-01-01T00:00:00-08:00"
                  :tz      "US/Pacific"}

                 :xlsx
                 {:date    #inst "2021-01-25T00:00:00.000-00:00"
                  :day     #inst "2021-01-25T00:00:00.000-00:00"
                  :week    #inst "2021-01-25T00:00:00.000-00:00"
                  :month   #inst "2021-01-01T00:00:00.000-00:00"
                  :quarter #inst "2021-01-01T00:00:00.000-00:00"
                  :tz      "US/Pacific"})))))))))
