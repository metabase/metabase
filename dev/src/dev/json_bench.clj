(ns dev.json-bench
  "Benchmarks of [[metabase.util.json]] on the paths Metabase spends JSON time on: streaming query results, encoding
  API responses, decoding app DB columns and decoding request bodies.

  Only uses the public `metabase.util.json` API and the `:api` results writer, so the same code can be run against
  another JSON implementation (e.g. a commit before a change) to compare. Run it in a fresh JVM:

    clojure -M:dev -e \"(require 'dev.json-bench) (dev.json-bench/run-benchmarks!)\"

  Prints the mean time per operation (criterium quick bench) and the bytes allocated per operation."
  (:require
   [criterium.core :as crit]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.query-processor.streaming.json]
   [metabase.server.middleware.json]
   [metabase.util.json :as json])
  (:import
   (com.sun.management ThreadMXBean)
   (java.io ByteArrayInputStream OutputStream StringReader)
   (java.lang.management ManagementFactory)
   (java.nio.charset StandardCharsets)
   (java.time LocalDate OffsetDateTime ZoneOffset)
   (java.util Random)))

(set! *warn-on-reflection* true)

(defn- rand-str [^Random rnd n]
  (apply str (repeatedly n #(char (+ 97 (.nextInt rnd 26))))))

(def ^:private cols
  (vec (for [i (range 8)]
         {:name (str "col_" i)
          :display_name (str "Column " i)
          :base_type :type/Text
          :field_ref [:field i nil]
          :semantic_type nil
          :source :fields})))

(defn- result-rows
  "50k rows of the column types a query commonly returns."
  []
  (let [rnd (Random. 42)]
    (vec (for [i (range 50000)]
           [i
            (* 1000 (.nextDouble rnd))
            (rand-str rnd 12)
            (str "Café " (rand-str rnd 6) " ✓")
            (OffsetDateTime/of 2024 1 1 0 0 0 0 ZoneOffset/UTC)
            (LocalDate/of 2024 (inc (.nextInt rnd 12)) 1)
            nil
            (.nextBoolean rnd)]))))

(defn- cards
  "500 maps shaped like the cards of an API response."
  []
  (let [rnd (Random. 42)]
    (vec (for [i (range 500)]
           {:id i
            :name (rand-str rnd 20)
            :description (rand-str rnd 80)
            :display :table
            :archived false
            :collection_id (.nextInt rnd 100)
            :creator_id 1
            :type :question
            :created_at (OffsetDateTime/of 2024 1 1 0 0 0 0 ZoneOffset/UTC)
            :updated_at (OffsetDateTime/of 2024 6 1 12 30 0 0 ZoneOffset/UTC)
            :dataset_query {:database 1
                            :type :query
                            :query {:source-table 2
                                    :aggregation [[:count]]
                                    :breakout [[:field 3 {:temporal-unit :month}]]}}
            :visualization_settings {:table.pivot false
                                     :column_settings {"[\"name\",\"x\"]" {:currency "EUR"}}}
            :result_metadata cols
            :collection {:id 3 :name "Shared" :location "/1/2/"}}))))

(defn- stream-api-results! [rows]
  (let [w (qp.si/streaming-results-writer :api (OutputStream/nullOutputStream))]
    (qp.si/begin! w {:data {:cols cols}} {})
    (doseq [row rows]
      (qp.si/write-row! w row 0 cols {}))
    (qp.si/finish! w {:data {:cols cols :native_form {:query "SELECT 1"} :results_timezone "UTC"}
                      :row_count (count rows)
                      :status :completed
                      :running_time 12})))

(defn- allocated-bytes ^long []
  (.getCurrentThreadAllocatedBytes ^ThreadMXBean (ManagementFactory/getThreadMXBean)))

(defn- bench! [label f]
  (let [mean (first (:mean (crit/quick-benchmark* f {})))
        n 50
        before (allocated-bytes)
        _ (dotimes [_ n] (f))
        alloc (/ (- (allocated-bytes) before) n)]
    (printf "%-40s %12.1f us/op %12.1f KB/op%n" label (* mean 1e6) (/ alloc 1024.0))
    (flush)))

(defn run-benchmarks!
  "Run every benchmark and print the results. Takes a few minutes."
  []
  (let [rows (result-rows)
        cards (cards)
        metadata-json (json/encode cols)
        body (json/encode cards)
        body-bytes (.getBytes ^String body StandardCharsets/UTF_8)]
    ;; decoded results are realized: a decoder may return a lazy seq for a top-level array
    (bench! "qp :api stream 50k rows x 8 cols" #(stream-api-results! rows))
    (bench! "encode 500 cards (API response)" #(json/encode cards))
    (bench! "decode+kw result_metadata column" #(json/decode+kw metadata-json))
    (bench! "decode+kw 500 cards from String" #(doall (json/decode+kw body)))
    (bench! "decode+kw 500 cards from Reader" #(doall (json/decode+kw (StringReader. body))))
    (bench! "decode+kw 500 cards from InputStream" #(doall (json/decode+kw (ByteArrayInputStream. body-bytes))))))
