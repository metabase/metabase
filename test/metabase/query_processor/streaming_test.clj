(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.test.util :as tu]
            [metabase.util.files :as u.files]
            [ring.core.protocols :as ring.protocols])
  (:import [java.io FileOutputStream OutputStream]))

(defn- proxy-output-stream
  ^OutputStream [^OutputStream os close-chan]
  (proxy [OutputStream] []
    (flush []
      (.flush os))
    (close []
      (a/close! close-chan)
      (.close os))
    (write
      ([x]
       (if (int? x)
         (.write os ^int x)
         (.write os ^bytes x)))
      ([^bytes ba ^Integer off ^Integer len]
       (.write os ba off len)))))

(defn- parse-file [stream-type filename]
  (case stream-type
    (:json :json-download) (with-open [reader (io/reader filename)]
                             (json/parse-stream reader true))
    :csv                   (with-open [reader (io/reader filename)]
                             (doall (csv/read-csv reader)))
    :xlsx                  (->> (spreadsheet/load-workbook-from-file filename)
                                (spreadsheet/select-sheet "Query result")
                                (spreadsheet/select-columns {:A "ID", :B "Name", :C "Category ID", :D "Latitude", :E "Longitude", :F "Price"})
                                rest)))

(defn- process-query-streaming [stream-type query]
  (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") (mt/random-name)))]
    (with-redefs [streaming-response/keepalive-interval-ms 2]
      (mt/with-open-channels [close-chan (a/promise-chan)]
        (with-open [os (FileOutputStream. filename)]
          (let [proxy-os (proxy-output-stream os close-chan)]
            (ring.protocols/write-body-to-stream
             (qp.streaming/streaming-response [context stream-type]
               (Thread/sleep 10)
               (qp/process-query-async query context))
             nil
             proxy-os)
            (mt/wait-for-close close-chan 1000)
            (parse-file stream-type filename)))))))

(deftest streaming-json-test []
  (let [query             (mt/mbql-query venues {:limit 5})
        streaming-results (process-query-streaming :json query)
        expected-results    (tu/obj->json->obj (qp/process-query query))]
    ;; TODO -- not 100% sure why they two might be different. Will have to investigate.
    (is (= (m/dissoc-in expected-results    [:data :results_metadata :checksum])
           (m/dissoc-in streaming-results [:data :results_metadata :checksum])))))

(deftest streaming-json-download-test []
  (let [query                       (mt/mbql-query venues {:limit 5})
        streaming-results           (process-query-streaming :json-download query)
        {{:keys [cols rows]} :data} (tu/obj->json->obj (qp/process-query query))
        expected-results              (for [row rows]
                                      (zipmap (map (comp keyword :display_name) cols)
                                              row))]
    (is (= expected-results
           streaming-results))))

(deftest streaming-csv-test []
  (let [query                       (mt/mbql-query venues {:limit 5})
        streaming-results           (process-query-streaming :csv query)
        {{:keys [cols rows]} :data} (qp/process-query query)
        expected-results              (cons (map :display_name cols)
                                          (for [row rows]
                                            (for [v row]
                                              (str v))))]
    (is (= expected-results
           streaming-results))))

(deftest streaming-xlsx-test []
  (let [query                       (mt/mbql-query venues {:limit 5})
        streaming-results           (process-query-streaming :xlsx query)
        {{:keys [cols rows]} :data} (qp/process-query query)
        expected-results            (for [row rows]
                                      (zipmap (map :display_name cols)
                                              (for [v row]
                                                (if (number? v)
                                                  (double v)
                                                  v))))]
    (is (= expected-results
           streaming-results))))
