(ns dev.mq-perf
  "Performance benchmarks for the appdb-backed MQ system (queues and topics).

  Measures publishing throughput, end-to-end latency, and sustained throughput
  under different load levels. Benchmarks exercise the full realistic pipeline:
  publish buffer → DB → poll thread → worker pool → listener.

  Self-contained — starts the MQ subsystem without the full Metabase server.
  Supports multi-node testing: run multiple JVM instances against the same DB.

  Example usage:
    ;; Single-node: start MQ and run all benchmarks
    (start-mq!)
    (run-all-benchmarks!)

    ;; Multi-node coordination: start multiple JVMs, each calls:
    (start-mq!)
    (run-all-benchmarks-coordinated!)
    ;; Then from any node (or a separate REPL), publish the go signal:
    (signal-go!)

    ;; Individual benchmarks
    (bench-publish-throughput! {:n 1000 :batch-sizes [1 10 100]})
    (bench-e2e-latency! {:n 50 :rate :medium :transport :queue})
    (bench-sustained-throughput! {:duration-sec 15 :rate :medium :transport :queue})
    (bench-batch-listener! {:n 200 :batch-sizes [1 10 50]})
    (bench-multi-queue! {:queue-counts [1 5 10 20] :msgs-per-queue 50})"
  (:require
   [clojure.string :as str]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.topic.appdb :as topic.appdb]
   [metabase.mq.topic.backend :as topic.backend]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Startup ------------------------------------------------

(defonce ^:private started? (atom false))

(defn start-mq!
  "Minimal startup: connects to app DB and starts the MQ subsystem.
  No Jetty, no scheduler, no sample data. Idempotent."
  []
  (let [setup-db! (requiring-resolve 'metabase.app-db.core/setup-db!)]
    (setup-db! :create-sample-content? false))
  (let [setup-prometheus! (requiring-resolve 'metabase.analytics.prometheus/setup!)]
    (setup-prometheus!))
  (require 'metabase.mq.init)
  (let [startup! (requiring-resolve 'metabase.startup.core/def-startup-logic!)]
    (startup! :metabase.mq.init/MqInit))
  (reset! started? true)
  (println "MQ system started."))

(defn- ensure-started!
  "Starts the MQ system if not yet started, and restarts any dead poll threads."
  []
  (when-not @started?
    (start-mq!))
  ;; Restart poll threads if they died (e.g., from InterruptedException during a previous benchmark).
  ;; start! is idempotent and start-polling! detects dead futures.
  (let [start-transports! (requiring-resolve 'metabase.mq.impl/start-transports)]
    (start-transports!)))

;;; ------------------------------------------------ Utilities ------------------------------------------------

(def ^:private shared-queues
  "Fixed set of 10 shared queue names used across all nodes for cross-node contention testing."
  (mapv #(keyword "queue" (str "bench-shared-" %)) (range 10)))

(def ^:private shared-topic :topic/bench-shared)

(defn- run-id
  "Generates an 8-character unique identifier for a benchmark run."
  []
  (subs (str (random-uuid)) 0 8))

(defn- make-channel
  "Creates a unique channel keyword for benchmarking."
  [transport id suffix]
  (keyword (name transport) (str "bench-" id "-" suffix)))

(defn- random-shared-queue
  "Returns a random shared queue name."
  []
  (nth shared-queues (rand-int (count shared-queues))))

(defn- percentile
  "Returns the p-th percentile from a sorted vector (p in [0,1])."
  [sorted-vec p]
  (if (empty? sorted-vec)
    0.0
    (let [idx (min (dec (count sorted-vec))
                   (int (* p (count sorted-vec))))]
      (double (nth sorted-vec idx)))))

(defn- collect-stats
  "Computes summary statistics from a collection of numeric values.
  Returns {:count :min :max :avg :p50 :p95 :p99}."
  [values]
  (if (empty? values)
    {:count 0 :min 0.0 :max 0.0 :avg 0.0 :p50 0.0 :p95 0.0 :p99 0.0}
    (let [sorted (vec (sort values))
          n      (count sorted)]
      {:count n
       :min   (double (first sorted))
       :max   (double (last sorted))
       :avg   (/ (reduce + 0.0 sorted) n)
       :p50   (percentile sorted 0.50)
       :p95   (percentile sorted 0.95)
       :p99   (percentile sorted 0.99)})))

(defn- fmt
  "Formats a number for display."
  [x]
  (if (integer? x)
    (str x)
    (format "%.2f" (double x))))

(defn- print-table!
  "Prints a formatted ASCII table."
  [title headers rows]
  (let [col-widths (mapv (fn [i]
                           (apply max
                                  (count (nth headers i))
                                  (map #(count (str (nth % i))) rows)))
                         (range (count headers)))
        separator  (str "+-" (str/join "-+-" (map #(apply str (repeat % \-)) col-widths)) "-+")
        fmt-row    (fn [vals]
                     (str "| "
                          (str/join " | "
                                    (map-indexed (fn [i v]
                                                   (format (str "%-" (nth col-widths i) "s") (str v)))
                                                 vals))
                          " |"))]
    (println)
    (println title)
    (println separator)
    (println (fmt-row headers))
    (println separator)
    (doseq [row rows]
      (println (fmt-row row)))
    (println separator)
    (println)))

(defn- cleanup!
  "Removes all benchmark data for the given run-id."
  [id]
  (t2/delete! :queue_message_batch :queue_name [:like (str "bench-" id "%")])
  (t2/delete! :topic_message_batch :topic_name [:like (str "bench-" id "%")])
  (doseq [[ch _] @listener/*listeners*]
    (when (str/includes? (name ch) (str "bench-" id))
      (mq/unlisten! ch))))

(defn- publish-at-rate!
  "Publishes `n` messages at the given rate (msgs/sec). `publish-fn` is called with each seq num.
  If rate is nil, publishes as fast as possible (burst mode)."
  [n rate publish-fn]
  (if (nil? rate)
    (dotimes [i n]
      (publish-fn i))
    (let [interval-ms (long (/ 1000 rate))]
      (dotimes [i n]
        (let [start (System/currentTimeMillis)]
          (publish-fn i)
          (let [elapsed (- (System/currentTimeMillis) start)
                sleep-ms (- interval-ms elapsed)]
            (when (pos? sleep-ms)
              (Thread/sleep (long sleep-ms)))))))))

(def ^:private rate-map
  {:low    10
   :medium 100
   :high   1000
   :burst  nil})

(defn- rate->msgs-sec [rate]
  (get rate-map rate rate))

;;; ---------------------------------------- Benchmark 1: Publishing Throughput ----------------------------------------

(defn bench-publish-throughput!
  "Measures raw publishing speed for different batch sizes.
  This benchmark bypasses the publish buffer to measure direct DB insert speed.
  Options:
    :n           - total messages to publish per batch-size test (default 1000)
    :batch-sizes - vector of batch sizes to test (default [1 10 100])
    :transport   - :queue or :topic (default :queue)"
  ([] (bench-publish-throughput! {}))
  ([{:keys [n batch-sizes transport]
     :or   {n 1000 batch-sizes [1 10 100] transport :queue}}]
   (ensure-started!)
   (let [id      (run-id)
         results (atom [])]
     (try
       (doseq [bs batch-sizes]
         (let [channel    (make-channel transport id (str "pub-" bs))
               iterations (/ n bs)
               start      (System/nanoTime)]
           (binding [publish-buffer/*publish-buffer-ms* 0]
             (dotimes [i iterations]
               (let [msgs (vec (for [j (range bs)]
                                 {:seq (+ (* i bs) j) :ts (System/currentTimeMillis)}))]
                 (if (= transport :queue)
                   (q.backend/publish! q.appdb/backend channel msgs)
                   (topic.backend/publish! topic.appdb/backend channel msgs)))))
           (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)]
             (swap! results conj
                    [(str bs) (fmt (/ n (/ elapsed-ms 1000.0))) (fmt elapsed-ms)]))))
       (print-table!
        (str "Publishing Throughput (" (name transport) ", n=" n ")")
        ["Batch Size" "Msgs/sec" "Total ms"]
        @results)
       (finally
         (cleanup! id))))))

;;; ---------------------------------------- Benchmark 2: End-to-End Latency ----------------------------------------

(defn bench-e2e-latency!
  "Measures end-to-end latency from publish to listener receipt via the full async pipeline.
  Uses the real publish API including the publish buffer.
  Publishes randomly to the 10 shared queues (or the shared topic) so multiple nodes
  compete for the same messages.
  Options:
    :n         - number of messages to publish (default 50)
    :rate      - :low, :medium, :high, or :burst (default :medium)
    :transport - :queue or :topic (default :queue)"
  ([] (bench-e2e-latency! {}))
  ([{:keys [n rate transport]
     :or   {n 50 rate :medium transport :queue}}]
   (ensure-started!)
   (let [latencies (atom [])
         received  (atom 0)
         channels  (if (= transport :queue) shared-queues [shared-topic])]
     (try
       ;; Register listeners on all shared channels
       (doseq [ch channels]
         (when-not (listener/get-listener ch)
           (mq/listen! ch {}
                       (fn [msg]
                         (let [receive-ns  (System/nanoTime)
                               publish-ns  (get msg "publish-ns")]
                           (when publish-ns
                             (swap! latencies conj (/ (- receive-ns (double publish-ns)) 1e6))))
                         (swap! received inc)))))
       (let [msgs-sec (rate->msgs-sec rate)
             start    (System/nanoTime)]
         ;; Publish to random shared channels
         (publish-at-rate!
          n msgs-sec
          (fn [i]
            (let [ch (if (= transport :queue) (random-shared-queue) shared-topic)]
              (if (= transport :queue)
                (mq/with-queue ch [q]
                  (mq/put q {:seq i :publish-ns (System/nanoTime)}))
                (mq/with-topic ch [t]
                  (mq/put t {:seq i :publish-ns (System/nanoTime)}))))))
         ;; Force flush the publish buffer then wait for delivery
         (publish-buffer/flush-publish-buffer!)
         ;; Wait until we've received at least n messages or timeout
         (let [deadline (+ (System/currentTimeMillis)
                           (long (* 1000 (+ 30 (/ n (max 1 (or msgs-sec 1000)))))))]
           (while (and (< @received n)
                       (< (System/currentTimeMillis) deadline))
             (Thread/sleep (long 100))))
         (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)
               stats      (collect-stats @latencies)]
           (print-table!
            (str "End-to-End Latency (" (name transport) ", rate=" (name rate) ", n=" n ")")
            ["Metric" "Value"]
            [["Published" (str n)]
             ["Received" (str @received)]
             ["Other nodes" (str (max 0 (- n @received)))]
             ["From others" (str (max 0 (- @received n)))]
             ["Total ms" (fmt elapsed-ms)]
             ["P50 ms" (fmt (:p50 stats))]
             ["P95 ms" (fmt (:p95 stats))]
             ["P99 ms" (fmt (:p99 stats))]
             ["Min ms" (fmt (:min stats))]
             ["Max ms" (fmt (:max stats))]
             ["Avg ms" (fmt (:avg stats))]])))
       (finally
         (doseq [ch channels]
           (when (listener/get-listener ch)
             (mq/unlisten! ch))))))))

;;; ---------------------------------------- Benchmark 3: Sustained Throughput ----------------------------------------

(defn bench-sustained-throughput!
  "Publishes continuously while consuming for a given duration via the full async pipeline.
  Publishes randomly to the 10 shared queues (or shared topic).
  Options:
    :duration-sec - how long to publish (default 15)
    :rate         - :low, :medium, :high, or :burst (default :medium)
    :transport    - :queue or :topic (default :queue)"
  ([] (bench-sustained-throughput! {}))
  ([{:keys [duration-sec rate transport]
     :or   {duration-sec 15 rate :medium transport :queue}}]
   (ensure-started!)
   (let [channels  (if (= transport :queue) shared-queues [shared-topic])
         received  (atom 0)
         latencies (atom [])
         published (atom 0)
         stop?     (atom false)]
     (try
       ;; Register listeners on all shared channels
       (doseq [ch channels]
         (when-not (listener/get-listener ch)
           (mq/listen! ch {}
                       (fn [msg]
                         (let [receive-ns  (System/nanoTime)
                               publish-ns  (get msg "publish-ns")]
                           (when publish-ns
                             (swap! latencies conj (/ (- receive-ns (double publish-ns)) 1e6)))
                           (swap! received inc))))))
       (let [msgs-sec   (rate->msgs-sec rate)
             start      (System/nanoTime)
             pub-thread (Thread.
                         (fn []
                           (loop []
                             (when-not @stop?
                               (try
                                 (let [ch (if (= transport :queue) (random-shared-queue) shared-topic)]
                                   (if (= transport :queue)
                                     (mq/with-queue ch [q]
                                       (mq/put q {:seq @published :publish-ns (System/nanoTime)}))
                                     (mq/with-topic ch [t]
                                       (mq/put t {:seq @published :publish-ns (System/nanoTime)}))))
                                 (swap! published inc)
                                 (catch Exception _))
                               (when msgs-sec
                                 (Thread/sleep (long (/ 1000 msgs-sec))))
                               (recur)))))]
         (.start pub-thread)
         (Thread/sleep (long (* duration-sec 1000)))
         (reset! stop? true)
         (.join pub-thread 5000)
         ;; Flush publish buffer and wait for remaining messages to drain
         (publish-buffer/flush-publish-buffer!)
         (let [drain-start (System/currentTimeMillis)]
           (while (and (< @received @published)
                       (< (- (System/currentTimeMillis) drain-start) 30000))
             (publish-buffer/flush-publish-buffer!)
             (Thread/sleep (long 500))))
         (let [elapsed-ms  (/ (- (System/nanoTime) start) 1e6)
               stats       (collect-stats @latencies)]
           (print-table!
            (str "Sustained Throughput (" (name transport) ", rate=" (name rate)
                 ", duration=" duration-sec "s)")
            ["Metric" "Value"]
            [["Published" (str @published)]
             ["Received" (str @received)]
             ["Other nodes" (str (max 0 (- @published @received)))]
             ["From others" (str (max 0 (- @received @published)))]
             ["Duration ms" (fmt elapsed-ms)]
             ["Actual pub/sec" (fmt (/ @published (/ elapsed-ms 1000.0)))]
             ["Actual recv/sec" (fmt (/ @received (/ elapsed-ms 1000.0)))]
             ["P50 latency ms" (fmt (:p50 stats))]
             ["P95 latency ms" (fmt (:p95 stats))]
             ["P99 latency ms" (fmt (:p99 stats))]
             ["Max latency ms" (fmt (:max stats))]])))
       (finally
         (doseq [ch channels]
           (when (listener/get-listener ch)
             (mq/unlisten! ch))))))))

;;; ---------------------------------------- Benchmark 4: Batch Listener ----------------------------------------

(defn bench-batch-listener!
  "Compares single-message vs batch listener processing rates.
  Uses the shared queues so multiple nodes compete.
  Options:
    :n           - total messages to publish (default 200)
    :batch-sizes - vector of max-batch-messages values to test (default [1 10 50])"
  ([] (bench-batch-listener! {}))
  ([{:keys [n batch-sizes]
     :or   {n 200 batch-sizes [1 10 50]}}]
   (ensure-started!)
   (let [results (atom [])]
     (doseq [bs batch-sizes]
       (let [received (atom 0)]
         (try
           ;; Register listeners on all shared queues
           (doseq [ch shared-queues]
             (when-not (listener/get-listener ch)
               (if (= bs 1)
                 (mq/listen! ch {}
                             (fn [_msg]
                               (swap! received inc)))
                 (mq/batch-listen! ch
                                   (fn [msgs]
                                     (swap! received + (count msgs)))
                                   {:max-batch-messages bs}))))
           ;; Publish all messages randomly to shared queues
           (dotimes [i n]
             (mq/with-queue (random-shared-queue) [q]
               (mq/put q {:seq i})))
           (publish-buffer/flush-publish-buffer!)
           ;; Wait for messages to be consumed
           (let [start   (System/nanoTime)
                 deadline (+ (System/currentTimeMillis) 30000)]
             (while (and (< @received n)
                         (< (System/currentTimeMillis) deadline))
               (Thread/sleep (long 100)))
             (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)]
               (swap! results conj
                      [(str bs) (str @received) (fmt elapsed-ms)
                       (fmt (/ @received (/ elapsed-ms 1000.0)))])))
           (finally
             (doseq [ch shared-queues]
               (when (listener/get-listener ch)
                 (mq/unlisten! ch)))))))
     (print-table!
      (str "Batch Listener Comparison (n=" n ")")
      ["Max Batch" "Received" "Process ms" "Msgs/sec"]
      @results))))

;;; ---------------------------------------- Benchmark 5: Multiple Queues ----------------------------------------

(defn bench-multi-queue!
  "Measures performance with varying numbers of the shared queues.
  Tests with subsets of the 10 shared queues to show scaling.
  Options:
    :queue-counts   - vector of queue counts to test (default [1 5 10])
    :msgs-per-queue - messages per queue (default 50)"
  ([] (bench-multi-queue! {}))
  ([{:keys [queue-counts msgs-per-queue]
     :or   {queue-counts [1 5 10] msgs-per-queue 50}}]
   (ensure-started!)
   (let [results (atom [])]
     (doseq [qc queue-counts]
       (let [channels (subvec shared-queues 0 (min qc (count shared-queues)))
             total    (* (count channels) msgs-per-queue)
             received (atom 0)]
         (try
           ;; Register listeners
           (doseq [ch channels]
             (when-not (listener/get-listener ch)
               (mq/listen! ch {}
                           (fn [_msg]
                             (swap! received inc)))))
           ;; Publish to the queues
           (let [start (System/nanoTime)]
             (doseq [ch channels]
               (dotimes [i msgs-per-queue]
                 (mq/with-queue ch [q]
                   (mq/put q {:seq i}))))
             (publish-buffer/flush-publish-buffer!)
             ;; Wait for messages
             (let [deadline (+ (System/currentTimeMillis) 60000)]
               (while (and (< @received total)
                           (< (System/currentTimeMillis) deadline))
                 (Thread/sleep (long 100))))
             (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)]
               (swap! results conj
                      [(str (count channels)) (str total) (str @received) (fmt elapsed-ms)
                       (fmt (/ @received (/ elapsed-ms 1000.0)))])))
           (finally
             (doseq [ch channels]
               (when (listener/get-listener ch)
                 (mq/unlisten! ch)))))))
     (print-table!
      (str "Multiple Queues (msgs-per-queue=" msgs-per-queue ")")
      ["Queues" "Total Msgs" "Received" "Total ms" "Msgs/sec"]
      @results))))

;;; ---------------------------------------- Run All ----------------------------------------

(defn run-all-benchmarks!
  "Runs all benchmark scenarios with default parameters."
  []
  (println "=== MQ Performance Benchmarks ===")
  (println)

  (println "--- 1/5: Publishing Throughput (Queue) ---")
  (bench-publish-throughput! {:n 1000 :transport :queue})

  (println "--- 1b/5: Publishing Throughput (Topic) ---")
  (bench-publish-throughput! {:n 1000 :transport :topic})

  (println "--- 2/5: End-to-End Latency ---")
  (doseq [rate [:low :medium :high :burst]]
    (bench-e2e-latency! {:n 50 :rate rate :transport :queue}))
  (doseq [rate [:low :medium :burst]]
    (bench-e2e-latency! {:n 50 :rate rate :transport :topic}))

  (println "--- 3/5: Sustained Throughput ---")
  (bench-sustained-throughput! {:duration-sec 15 :rate :medium :transport :queue})
  (bench-sustained-throughput! {:duration-sec 15 :rate :medium :transport :topic})

  (println "--- 4/5: Batch Listener Comparison ---")
  (bench-batch-listener! {:n 200})

  (println "--- 5/5: Multiple Queues ---")
  (bench-multi-queue! {:queue-counts [1 5 10 20] :msgs-per-queue 50})

  (println "=== All benchmarks complete ==="))

;;; ---------------------------------------- Multi-Node Coordination ----------------------------------------

(defn run-all-benchmarks-coordinated!
  "Waits for a 'go' signal on :topic/bench-coordination, then runs all benchmarks.
  Use with multiple JVM instances to start benchmarks simultaneously.

  Usage:
    ;; On each node:
    (start-mq!)
    (run-all-benchmarks-coordinated!)

    ;; Then from any node or separate REPL:
    (signal-go!)"
  []
  (let [latch (CountDownLatch. 1)]
    (mq/listen! :topic/bench-coordination {}
                (fn [_msg]
                  (.countDown latch)))
    (println "Waiting for go signal... (call (signal-go!) from any node)")
    (.await latch 300 TimeUnit/SECONDS)
    (mq/unlisten! :topic/bench-coordination)
    (println "Go signal received! Starting benchmarks...")
    (run-all-benchmarks!)))

(defn signal-go!
  "Sends the go signal to all waiting nodes."
  []
  (mq/with-topic :topic/bench-coordination [t]
    (mq/put t {:go true :time (System/currentTimeMillis)}))
  (println "Go signal sent."))
