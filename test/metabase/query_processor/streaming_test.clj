(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.test.util :as tu]
            [ring.core.protocols :as ring.protocols]
            [toucan.db :as db])
  (:import [java.io BufferedInputStream BufferedOutputStream FilterOutputStream InputStream InputStreamReader
            OutputStream PipedInputStream PipedOutputStream]))

(defmulti ^:private parse-result
  {:arglists '([export-format ^InputStream input-stream])}
  (fn [export-format _] (keyword export-format)))

(defmethod parse-result :api
  [_ ^InputStream is]
  (with-open [reader (InputStreamReader. is)]
    (json/parse-stream reader true)))

(defmethod parse-result :json
  [export-format is]
  ((get-method parse-result :api) export-format is))

(defmethod parse-result :csv
  [_ ^InputStream is]
  (with-open [reader (InputStreamReader. is)]
    (doall (csv/read-csv reader))))

(defmethod parse-result :xlsx
  [_ ^InputStream is]
  (->> (spreadsheet/load-workbook-from-stream is)
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns {:A "ID", :B "Name", :C "Category ID", :D "Latitude", :E "Longitude", :F "Price"})
       rest))

(defn- close-notifying-stream
  ^FilterOutputStream [close-chan ^OutputStream os]
  (proxy [FilterOutputStream] [os]
    (close []
      (a/put! close-chan ::close)
      (try
        (.flush os)
        (.close os)
        (catch Throwable _)))))

(defn- process-query-streaming [export-format query]
  (with-redefs [streaming-response/keepalive-interval-ms 2]
    (mt/with-open-channels [close-chan (a/promise-chan)]
      (with-open [pos (PipedOutputStream.)
                  os  (close-notifying-stream close-chan (BufferedOutputStream. pos))
                  is  (BufferedInputStream. (PipedInputStream. pos))]
        (ring.protocols/write-body-to-stream
         (qp.streaming/streaming-response [context export-format]
           (qp/process-query-async query (assoc context :timeout 5000)))
         nil
         os)
        (mt/wait-for-result close-chan 100)
        (parse-result export-format is)))))

(defmulti ^:private expected-results
  {:arglists '([export-format normal-results])}
  (fn [export-format _] (keyword export-format)))

(defmethod expected-results :api
  [_ normal-results]
  (tu/obj->json->obj normal-results))

(defmethod expected-results :json
  [_ normal-results]
  (let [{{:keys [cols rows]} :data} (tu/obj->json->obj normal-results)]
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

(defn- compare-results-for-query [export-format query]
  (let [query             query
        streaming-results (maybe-remove-checksum (process-query-streaming export-format query))
        expected-results  (maybe-remove-checksum (expected-results export-format (qp/process-query query)))]
    (is (= expected-results
           streaming-results))))

(deftest streaming-response-test
  (doseq [export-format (qp.streaming/export-formats)]
    (testing export-format
      (compare-results-for-query export-format (mt/mbql-query venues {:limit 5})))))

(deftest utf8-test
  ;; UTF-8 isn't currently working for XLSX -- fix me
  (doseq [export-format (disj (qp.streaming/export-formats) :xlsx)]
    (testing export-format
      (testing "Make sure our various streaming formats properly write values as UTF-8."
        (testing "A query that will have a little → in its name"
          (compare-results-for-query export-format (mt/mbql-query venues
                                                     {:fields   [$name $category_id->categories.name]
                                                      :order-by [[:asc $id]]
                                                      :limit    5})))
        (testing "A query with emoji and other fancy unicode"
          (let [[sql & args] (db/honeysql->sql {:select [["Cam 𝌆 Saul 💩" :cam]]})]
            (compare-results-for-query export-format (mt/native-query {:query  sql
                                                                       :params args}))))))))
