(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.test.util :as tu]
            [metabase.util.files :as u.files]
            [ring.core.protocols :as ring.protocols])
  (:import java.io.Writer))

(defn- proxy-writer [^Writer writer close-chan]
  (proxy [Writer] []
    (append
      ([x]
       (if (char? x)
         (.append writer ^Character x)
         (.append writer ^CharSequence x)))
      ([^CharSequence csq ^Integer start ^Integer end]
       (.append writer csq start end)))
    (close []
      (.close writer)
      (a/close! close-chan))
    (flush []
      (.flush writer))
    (write
      ([x]
       (cond
         (int? x)    (.write writer ^Integer x)
         (string? x) (.write writer ^String x)
         :else       (.write writer ^chars x)))
      ([x ^Integer off ^Integer len]
       (if (string? x)
         (.write writer ^String x off len)
         (.write writer ^chars x off len))))))

(defn- parse-file [stream-type ^java.io.Reader reader]
  (case stream-type
    (:json :json-download) (json/parse-stream reader true)
    :csv                   (doall (csv/read-csv reader))))

(defn- process-query-streaming [stream-type query]
  (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") (mt/random-name)))]
    (with-redefs [streaming-response/keepalive-interval-ms 2]
      (mt/with-open-channels [close-chan (a/promise-chan)]
        (with-open [writer (io/writer filename)]
          (let [proxy-writer (proxy-writer writer close-chan)]
            (ring.protocols/write-body-to-stream
             (qp.streaming/streaming-response [context stream-type]
               (Thread/sleep 10)
               (qp/process-query-async query context))
             nil
             proxy-writer)
            (mt/wait-for-close close-chan 1000)
            (with-open [reader (io/reader filename)]
              (parse-file stream-type reader))))))))

(deftest streaming-json-test []
  (let [query             (mt/mbql-query venues {:limit 5})
        streaming-results (process-query-streaming :json query)
        normal-results    (tu/obj->json->obj (qp/process-query query))]
    ;; TODO -- not 100% sure why they two might be different. Will have to investigate.
    (is (= (m/dissoc-in normal-results    [:data :results_metadata :checksum])
           (m/dissoc-in streaming-results [:data :results_metadata :checksum])))))

(deftest streaming-json-download-test []
  (let [query                       (mt/mbql-query venues {:limit 5})
        streaming-results           (process-query-streaming :json-download query)
        {{:keys [cols rows]} :data} (tu/obj->json->obj (qp/process-query query))
        normal-results              (for [row rows]
                                      (zipmap (map (comp keyword :display_name) cols)
                                              row))]
    (is (= normal-results
           streaming-results))))

(deftest streaming-csv-test []
  (let [query                       (mt/mbql-query venues {:limit 5})
        streaming-results           (process-query-streaming :csv query)
        {{:keys [cols rows]} :data} (qp/process-query query)
        normal-results              (cons (map :display_name cols)
                                          (for [row rows]
                                            (for [v row]
                                              (str v))))]
    (is (= normal-results
           streaming-results))))
