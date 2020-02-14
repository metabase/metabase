(ns metabase.query-processor.streaming-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util.files :as u.files]
            [ring.core.protocols :as ring.protocols])
  (:import java.io.Writer))

(deftest map->serialized-json-kvs-test
  (is (= "\"a\":100,\"b\":200"
         (#'streaming/map->serialized-json-kvs {:a 100, :b 200}))))

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

(defn- process-query-streaming [query]
  (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") (str (mt/random-name) ".json")))]
    (with-redefs [streaming-response/keepalive-interval-ms 2]
      (mt/with-open-channels [close-chan (a/promise-chan)]
        (with-open [writer (io/writer filename)]
          (let [proxy-writer (proxy-writer writer close-chan)]
            (ring.protocols/write-body-to-stream
             (qp.streaming/streaming-response [context]
               (Thread/sleep 10)
               (qp/process-query-async query context))
             nil
             proxy-writer)
            (mt/wait-for-close close-chan 1000)
            (json/parse-stream (io/reader filename) true)))))))

(deftest streaming-json-test []
  (let [query             (mt/mbql-query venues {:limit 5})
        streaming-results (process-query-streaming query)
        normal-results    (tu/obj->json->obj (qp/process-query query))]
    (is (= normal-results
           streaming-results))))
