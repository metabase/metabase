(ns metabase.query-processor.streaming
  (:require [clojure.core.async :as a]
            [clojure.java.io :as io]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.async.api-response-3 :as api-response]
            [metabase.query-processor.context.default :as context.default]))

(defn- print-rows-rff [metadata]
  (fn
    ([] 0)

    ([acc]
     acc)

    ([row-count row]
     (printf "ROW %d -> %s\n" (inc row-count) (pr-str row))
     (flush)
     (Thread/sleep 50)
     (inc row-count))))

(defn streaming-response [query]
  (api-response/keepalive-response [writerf]
    (letfn [(reducef* [xformf context metadata reducible-rows]
              (when-let [writer (writerf)]
                (binding [*out* writer]
                  (context.default/default-reducef xformf context metadata reducible-rows))))]
      (qp/process-query-async query {:reducef reducef*
                                     :rff     print-rows-rff}))))

(defn- x []
  (with-open [writer (io/writer "/tmp/wow.txt")]
    (let [result-chan (a/promise-chan)]
      (ring.core.protocols/write-body-to-stream
       (api-response/keepalive-response [writerf]
         (future
           (try
             (Thread/sleep 5000)
             (when-let [^java.io.Writer writer (writerf)]
               (println "writer:" writer)                    ; NOCOMMIT
               (println "<< BEGIN STREAMING RESULTS >>")     ; NOCOMMIT
               (dotimes [_ 3]
                 (Thread/sleep 1000)
                 (println "<WRITE LINE>")
                 (.write writer "WOW!\n")
                 (.flush writer)))
             (catch Throwable e
               (println "e:" e)         ; NOCOMMIT
               )))
         (future
           (Thread/sleep 10000)
           (println "<<DONE>>")
           (a/>!! result-chan "DONE!"))
         result-chan)
       nil
       writer))
    (Thread/sleep 15000)))

(defn- y []
  (let [writer      (io/writer "/tmp/wow.txt")
        result-chan (a/promise-chan)]
    (ring.core.protocols/write-body-to-stream
     (streaming-response (mt/mbql-query venues {:limit 10}))
     nil
     writer)
    (future
      (Thread/sleep 10000)
      (.close writer))
    nil))
