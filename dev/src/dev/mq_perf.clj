(ns dev.mq-perf
  "Performance benchmarks for the appdb-backed MQ queue system.

  Measures publishing throughput, end-to-end latency, and sustained throughput
  under different load levels. Benchmarks exercise the full realistic pipeline:
  publish buffer → DB → poll thread → worker pool → listener.

  Self-contained — starts the MQ subsystem without the full Metabase server.
  Supports multi-node testing: run multiple JVM instances against the same DB.

  Example usage:
    ;; Start MQ and run all benchmarks
    (start-mq!)
    (run-all-benchmarks!)

    ;; Individual benchmarks
    (bench-publish-throughput! {:n 1000 :batch-sizes [1 10 100]})
    (bench-e2e-latency! {:n 50 :rate :medium})
    (bench-sustained-throughput! {:duration-sec 15 :rate :medium})
    (bench-batch-listener! {:n 200 :batch-sizes [1 10 50]})
    (bench-multi-queue! {:queue-counts [1 5 10 20] :msgs-per-queue 50})"
  (:require
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.conn]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.polling :as polling]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.appdb :as q.appdb]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [toucan2.core :as t2])
  (:import
   (java.lang.reflect InvocationHandler Method Proxy)
   (java.sql Connection PreparedStatement Statement)
   (java.util.concurrent CountDownLatch TimeUnit)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ RTT injection ------------------------------------------------
;;;
;;; Wraps the application DB's `DataSource` so every JDBC `execute*` call sleeps a randomized
;;; interval before hitting Postgres. This lets us see what the perf picture looks like with
;;; cloud-realistic latency (~1-5 ms RTT) without leaving the JVM. The wrapper preserves the
;;; pooled DataSource underneath, so connection acquisition is unaffected — only query
;;; round-trips pay the simulated cost.

(defonce ^:private rtt-ms
  ;; Use an atom rather than a dynamic var so the injected RTT applies to *every* thread —
  ;; including the backend poll threads and the worker pool — without needing per-thread
  ;; bindings to be conveyed.
  (atom nil))

(defn- sleep-rtt! []
  (when-let [[mn mx] @rtt-ms]
    (let [delay (long (if (= mn mx) mn (+ mn (rand-int (inc (- mx mn))))))]
      (when (pos? delay) (Thread/sleep delay)))))

(defn- proxy-statement
  "Wrap a Statement / PreparedStatement so every `execute*` call sleeps the injected RTT
  before delegating. Returns a proxy that implements both `Statement` and
  `PreparedStatement` (PreparedStatement extends Statement, so a single proxy covers both)."
  [^Statement stmt]
  (Proxy/newProxyInstance
   (.getClassLoader Statement)
   (into-array Class [Statement PreparedStatement])
   (reify InvocationHandler
     (invoke [_ _proxy method args]
       (when (.startsWith (.getName ^Method method) "execute")
         (sleep-rtt!))
       (.invoke method stmt args)))))

(defn- proxy-connection
  "Wrap a Connection so prepareStatement / createStatement return latency-injecting Statements."
  [^Connection conn]
  (Proxy/newProxyInstance
   (.getClassLoader Connection)
   (into-array Class [Connection])
   (reify InvocationHandler
     (invoke [_ _proxy method args]
       (let [n (.getName ^Method method)
             result (.invoke method conn args)]
         (if (and (or (= n "prepareStatement") (= n "createStatement"))
                  (instance? Statement result))
           (proxy-statement result)
           result))))))

(defn- latent-datasource
  "Returns a wrapped DataSource whose connections inject RTT before every `execute*`.
  Delegates to the underlying pooled DataSource for connection acquisition itself."
  ^DataSource [^DataSource inner]
  (reify DataSource
    (getConnection [_]            (proxy-connection (.getConnection inner)))
    (getConnection [_ user pw]    (proxy-connection (.getConnection inner user pw)))
    (getLoginTimeout [_]          (.getLoginTimeout inner))
    (setLoginTimeout [_ s]        (.setLoginTimeout inner s))
    (getLogWriter [_]             (.getLogWriter inner))
    (setLogWriter [_ pw]          (.setLogWriter inner pw))
    (getParentLogger [_]          (.getParentLogger inner))
    (^boolean isWrapperFor [_ ^Class iface] (.isWrapperFor inner iface))
    (^Object unwrap [_ ^Class iface]        (.unwrap inner iface))))

(defonce ^:private wrapped-datasource? (atom false))

(defn install-rtt!
  "Wraps the app DB's DataSource so every JDBC `execute*` call sleeps `[min-ms max-ms]`
  before delegating. Idempotent — calling this twice keeps a single wrapper. Use
  `(install-rtt! nil nil)` (or `(uninstall-rtt!)`) to disable injection without unwrapping.
  Returns the new effective `[min max]`."
  [min-ms max-ms]
  (reset! rtt-ms (when (and min-ms max-ms) [min-ms max-ms]))
  (when-not @wrapped-datasource?
    (let [orig    mdb.conn/*application-db*
          wrapped (mdb.conn/application-db (.db-type orig)
                                           (latent-datasource (.data-source orig))
                                           :create-pool? false)]
      (alter-var-root #'mdb.conn/*application-db* (constantly wrapped))
      (reset! wrapped-datasource? true)))
  @rtt-ms)

(defn uninstall-rtt!
  "Disables RTT injection. Leaves the DataSource wrapper in place (no-op when rtt-ms is nil)
  to avoid surprises if other code captured the wrapped instance."
  []
  (reset! rtt-ms nil))

(defmacro with-rtt-ms
  "Runs `body` with `[min-ms max-ms]` RTT injected on every JDBC execute, then restores the
  prior setting."
  [[min-ms max-ms] & body]
  `(let [prev# @rtt-ms]
     (install-rtt! ~min-ms ~max-ms)
     (try ~@body
          (finally
            (reset! rtt-ms prev#)))))

;;; ------------------------------------------------ Startup ------------------------------------------------

(defonce ^:private started? (atom false))

(declare declare-shared-queues!)

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
    (startup! :metabase.mq.init/MqStart))
  (reset! started? true)
  (println "MQ system started."))

(defn- ensure-started!
  "Starts the MQ system if not yet started, and restarts any dead poll threads."
  []
  (when-not @started?
    (start-mq!))
  ;; Restart poll threads if they died (e.g., from InterruptedException during a previous benchmark).
  ;; start! is idempotent and the shared poll driver detects dead futures.
  (q.backend/start! q.appdb/backend)
  ;; Benchmarks register listeners on the shared queues, which now requires the queues to be
  ;; declared first.
  (declare-shared-queues!))

;;; ------------------------------------------------ Utilities ------------------------------------------------

(def ^:private shared-queues
  "Fixed set of 10 shared queue names used across all nodes for cross-node contention testing."
  (mapv #(keyword "queue" (str "bench-shared-" %)) (range 10)))

(defn- ensure-queue!
  "Declares `ch` in the queue registry (default config unless given) if not already declared.
  Listeners require their queue to be declared first, so benchmarks call this before
  `batch-listen!`. Idempotent for identical config."
  ([ch] (ensure-queue! ch {}))
  ([ch config]
   (when-not (q.registry/get-queue ch)
     (q.registry/register-queue! ch config))))

(defn- declare-shared-queues!
  "Declares all shared benchmark queues with default config."
  []
  (run! ensure-queue! shared-queues))

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
    :batch-sizes - vector of batch sizes to test (default [1 10 100])"
  ([] (bench-publish-throughput! {}))
  ([{:keys [n batch-sizes]
     :or   {n 1000 batch-sizes [1 10 100]}}]
   (ensure-started!)
   (let [id      (run-id)
         results (atom [])]
     (try
       (doseq [bs batch-sizes]
         (let [channel    (make-channel :queue id (str "pub-" bs))
               iterations (/ n bs)
               start      (System/nanoTime)]
           (binding [publish-buffer/*publish-buffer-ms* 0]
             (dotimes [i iterations]
               (let [msgs (vec (for [j (range bs)]
                                 {:seq (+ (* i bs) j) :ts (System/currentTimeMillis)}))]
                 (q.backend/publish! q.appdb/backend channel (payload/encode msgs)))))
           (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)]
             (swap! results conj
                    [(str bs) (fmt (/ n (/ elapsed-ms 1000.0))) (fmt elapsed-ms)]))))
       (print-table!
        (str "Publishing Throughput (queue, n=" n ")")
        ["Batch Size" "Msgs/sec" "Total ms"]
        @results)
       (finally
         (cleanup! id))))))

;;; ---------------------------------------- Benchmark 2: End-to-End Latency ----------------------------------------

(defn bench-e2e-latency!
  "Measures end-to-end latency from publish to listener receipt via the full async pipeline.
  Uses the real publish API including the publish buffer.
  Publishes randomly to the 10 shared queues so multiple nodes compete for the same messages.
  Options:
    :n         - number of messages to publish (default 50)
    :rate      - :low, :medium, :high, or :burst (default :medium)"
  ([] (bench-e2e-latency! {}))
  ([{:keys [n rate]
     :or   {n 50 rate :medium}}]
   (ensure-started!)
   (let [latencies (atom [])
         received  (atom 0)
         channels  shared-queues]
     (try
       ;; Register listeners on all shared channels
       (doseq [ch channels]
         (when-not (listener/get-listener ch)
           (listener/batch-listen! ch
                                   (fn [msgs]
                                     (doseq [msg msgs]
                                       (let [receive-ns (System/nanoTime)
                                             publish-ns (get msg :publish-ns)]
                                         (when publish-ns
                                           (swap! latencies conj (/ (- receive-ns (double publish-ns)) 1e6))))
                                       (swap! received inc))))))
       (let [msgs-sec (rate->msgs-sec rate)
             start    (System/nanoTime)]
         ;; Publish to random shared channels
         (publish-at-rate!
          n msgs-sec
          (fn [i]
            (let [ch (random-shared-queue)]
              (mq/with-queue ch [q]
                (mq/put q {:seq i :publish-ns (System/nanoTime)})))))
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
            (str "End-to-End Latency (queue, rate=" (name rate) ", n=" n ")")
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
  Publishes randomly to the 10 shared queues.
  Options:
    :duration-sec - how long to publish (default 15)
    :rate         - :low, :medium, :high, or :burst (default :medium)"
  ([] (bench-sustained-throughput! {}))
  ([{:keys [duration-sec rate]
     :or   {duration-sec 15 rate :medium}}]
   (ensure-started!)
   (let [channels  shared-queues
         received  (atom 0)
         latencies (atom [])
         published (atom 0)
         stop?     (atom false)]
     (try
       ;; Register listeners on all shared channels
       (doseq [ch channels]
         (when-not (listener/get-listener ch)
           (listener/batch-listen! ch
                                   (fn [msgs]
                                     (doseq [msg msgs]
                                       (let [receive-ns (System/nanoTime)
                                             publish-ns (get msg :publish-ns)]
                                         (when publish-ns
                                           (swap! latencies conj (/ (- receive-ns (double publish-ns)) 1e6)))
                                         (swap! received inc)))))))
       (let [msgs-sec   (rate->msgs-sec rate)
             start      (System/nanoTime)
             pub-thread (Thread.
                         (fn []
                           (loop []
                             (when-not @stop?
                               (try
                                 (let [ch (random-shared-queue)]
                                   (mq/with-queue ch [q]
                                     (mq/put q {:seq @published :publish-ns (System/nanoTime)})))
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
            (str "Sustained Throughput (queue, rate=" (name rate)
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
       (let [received (atom 0)
             ;; `:max-batch-messages` is now an immutable per-queue property, so each batch
             ;; size gets its own dedicated set of queues declared with that config.
             channels (mapv #(keyword "queue" (str "bench-batch-" bs "-" %))
                            (range (count shared-queues)))]
         (try
           (doseq [ch channels]
             (ensure-queue! ch {:max-batch-messages bs})
             (when-not (listener/get-listener ch)
               (listener/batch-listen! ch
                                       (fn [msgs]
                                         (swap! received + (count msgs))))))
           ;; Publish all messages randomly across this batch size's queues
           (dotimes [i n]
             (mq/with-queue (nth channels (rand-int (count channels))) [q]
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
             (doseq [ch channels]
               (when (listener/get-listener ch)
                 (mq/unlisten! ch))
               (t2/delete! :queue_message_batch :queue_name (name ch)))))))
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
               (listener/batch-listen! ch
                                       (fn [msgs]
                                         (swap! received + (count msgs))))))
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

;;; ---------------------------------------- Benchmark 6: Concurrent Consumers (LATERAL/SKIP LOCKED) ----------------------------------------

(defn bench-concurrent-consumers!
  "Validates the LATERAL/SKIP LOCKED fetch and exactly-once delivery under multi-consumer
  contention by spinning up multiple `AppDbQueueBackend` instances in the same JVM, each
  with its own listener atom and poll thread. All instances share the queue and DB.

  What this actually measures:
   - **Correctness**: every row is processed exactly once (`Dups` should always be 0; the
     `Imbalance` shows how the work spread but the total received must equal `n`).
   - **Per-row contention**: `mq.impl/active-handlers` is a JVM-global atom, so at most ONE
     consumer can be actively handling the channel at a time within a single JVM. The other
     consumers see `channel-busy?` and skip the queue. So this test does *not* validate
     cross-node throughput scaling — for that you need separate JVMs.
   - **Buffer-vs-row behavior**: `*publish-buffer-ms*` is forced to 0 so each `put` becomes
     its own row; otherwise the buffer collapses all `n` messages into a single row that
     only one consumer can grab.

  Options:
    :consumer-counts - vector of consumer counts to test (default [1 2 4 8])
    :n               - total messages per run (default 2000)
    :queue-name      - queue to use (default :queue/bench-concurrent)"
  ([] (bench-concurrent-consumers! {}))
  ([{:keys [consumer-counts n queue-name]
     :or   {consumer-counts [1 2 4 8] n 2000 queue-name :queue/bench-concurrent}}]
   (ensure-started!)
   (let [results (atom [])]
     (doseq [c consumer-counts]
       (let [per-consumer-received (vec (repeatedly c #(atom 0)))
             seen-batch-ids        (atom #{})
             duplicates            (atom 0)
             backends              (vec (repeatedly c q.appdb/make-backend))
             listener-atoms        (vec (repeatedly c #(atom {})))]
         (ensure-queue! queue-name)
         (try
           (doseq [i (range c)]
             (binding [listener/*listeners* (nth listener-atoms i)]
               (listener/batch-listen! queue-name
                                       (fn [msgs]
                                         (doseq [m msgs]
                                           (let [bid (get m "batch-id" m)]
                                             (when (contains? @seen-batch-ids bid)
                                               (swap! duplicates inc))
                                             (swap! seen-batch-ids conj bid)))
                                         (swap! (nth per-consumer-received i) + (count msgs))))
               (q.backend/start! (nth backends i))))
           (let [start (System/nanoTime)]
             ;; Bypass the time-windowed publish buffer (set *publish-buffer-ms* to 0) so each
             ;; `put` becomes its own DB row — otherwise all `n` messages collapse into one row
             ;; and there's nothing for multiple consumers to fetch in parallel.
             (binding [publish-buffer/*publish-buffer-ms* 0]
               (dotimes [i n]
                 (mq/with-queue queue-name [q]
                   (mq/put q {:id i})))
               (publish-buffer/flush-publish-buffer!))
             (let [total (atom 0)
                   deadline (+ (System/currentTimeMillis) 60000)]
               (while (and (< @total n)
                           (< (System/currentTimeMillis) deadline))
                 ;; Notify all poll threads so consumer backends drain promptly. In production
                 ;; the publish-side notify reaches the same node; multi-instance benchmarks
                 ;; sit between nodes where no cross-node wakeup exists.
                 (polling/notify-all!)
                 (reset! total (reduce + (map deref per-consumer-received)))
                 (Thread/sleep 50))
               (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)
                     received-per-consumer (mapv deref per-consumer-received)
                     min-c   (apply min received-per-consumer)
                     max-c   (apply max received-per-consumer)
                     spread  (when (pos? max-c)
                               (* 100.0 (- 1.0 (/ (double min-c) max-c))))]
                 (swap! results conj
                        [(str c)
                         (str @total)
                         (str (apply max received-per-consumer))
                         (str (apply min received-per-consumer))
                         (if spread (format "%.1f%%" spread) "n/a")
                         (str @duplicates)
                         (fmt elapsed-ms)
                         (fmt (/ @total (/ elapsed-ms 1000.0)))]))))
           (finally
             ;; Shut each backend's polling thread (per-instance, doesn't touch production)
             (doseq [be backends] (q.backend/shutdown! be))
             ;; Clean DB rows for this queue
             (t2/delete! :queue_message_batch :queue_name (name queue-name))))))
     (print-table!
      (str "Concurrent Consumers (n=" n " per run, queue=" (name queue-name) ")")
      ["Consumers" "Total" "Max/c" "Min/c" "Imbalance" "Dups" "Total ms" "Msgs/sec"]
      @results))))

;;; ---------------------------------------- Benchmark 7: Stale-Recovery Race ----------------------------------------

(defn bench-stale-recovery-race!
  "Pre-populates `:n` rows as `status=processing` with a stale heartbeat, then runs the
  recovery function from `:workers` threads simultaneously. Validates that the guarded
  bulk UPDATE delivers each row to exactly one winner regardless of concurrency.

  Options:
    :n       - number of stale rows to seed (default 500)
    :workers - concurrent recovery threads (default 8)"
  ([] (bench-stale-recovery-race! {}))
  ([{:keys [n workers] :or {n 500 workers 8}}]
   (ensure-started!)
   (let [queue-name (keyword "queue" (str "bench-stale-" (run-id)))
         stale-ts   (java.sql.Timestamp/from
                     (.minusMillis (java.time.Instant/now) (* 20 60 1000)))]
     (try
       (let [rows (vec (for [_ (range n)]
                         {:queue_name (name queue-name)
                          :payload    "[]"
                          :status     "processing"
                          :status_heartbeat stale-ts
                          :owner      "dead-node"}))]
         (t2/insert! :queue_message_batch rows))
       (let [recoveries (atom [])
             be         (q.appdb/make-backend)
             latch      (CountDownLatch. 1)
             threads    (mapv (fn [_]
                                (let [r (bound-fn []
                                          (.await latch)
                                          ;; Large max-retries so every stale row is recovered to 'pending'
                                          ;; rather than dropped, matching the original "all recovered" check.
                                          (let [results     (q.backend/recover-stale! be (* 10 60 1000) Integer/MAX_VALUE)
                                                n-recovered  (reduce + 0 (map #(+ (:recovered % 0) (:failed % 0)) results))]
                                            (swap! recoveries conj n-recovered)))]
                                  (Thread. ^Runnable r)))
                              (range workers))
             start      (System/nanoTime)]
         (run! #(.start ^Thread %) threads)
         (.countDown latch)
         (run! #(.join ^Thread % 30000) threads)
         (let [elapsed-ms  (/ (- (System/nanoTime) start) 1e6)
               total-rec   (reduce + @recoveries)
               final-state (frequencies (map :status (t2/select :queue_message_batch
                                                                :queue_name (name queue-name))))]
           (print-table!
            (str "Stale Recovery Race (n=" n " stale, workers=" workers ")")
            ["Metric" "Value"]
            [["Sum of returned counts" (str total-rec)]
             ["Stale rows pre-populated" (str n)]
             ["Sum == n? (correctness)" (if (= total-rec n) "YES" (str "NO  diff=" (- total-rec n)))]
             ["Final 'pending'" (str (get final-state "pending" 0))]
             ["Final 'failed'" (str (get final-state "failed" 0))]
             ["Final 'processing'" (str (get final-state "processing" 0))]
             ["Total wall-clock ms" (fmt elapsed-ms)]
             ["Per-row ms (effective)" (fmt (/ elapsed-ms (max 1 n)))]])))
       (finally
         (t2/delete! :queue_message_batch :queue_name (name queue-name)))))))

;;; ---------------------------------------- Benchmark 8: Concurrent Publish + Consume ----------------------------------------

(defn bench-concurrent-pub-consume!
  "Runs a publisher thread and a consumer simultaneously against one queue, measuring
  end-to-end latency under write contention. Unlike `bench-e2e-latency!`, the publisher and
  the wait-for-receive happen on separate threads, so we exercise the actual
  publish-while-consume code path (buffer atom contention, fetch contending with INSERT,
  the per-channel `active-handlers` gate).

  Each published message carries a `publish-ns` timestamp; the listener measures
  `receive-ns - publish-ns` and records it as the per-message latency.

  Options:
    :duration-sec - how long to publish for (default 10)
    :pub-rate-msgs-sec - target publish rate (default 50)
    :queue-name   - queue to use (default :queue/bench-pub-consume)"
  ([] (bench-concurrent-pub-consume! {}))
  ([{:keys [duration-sec pub-rate-msgs-sec queue-name]
     :or   {duration-sec 10 pub-rate-msgs-sec 50 queue-name :queue/bench-pub-consume}}]
   (ensure-started!)
   (let [received    (atom 0)
         latencies   (atom [])
         stop?       (atom false)
         publisher-published (atom 0)]
     (ensure-queue! queue-name)
     (try
       (listener/batch-listen! queue-name
                               (fn [msgs]
                                 (let [now (System/nanoTime)]
                                   (doseq [m msgs]
                                     (when-let [pub-ns (get m :publish-ns)]
                                       (swap! latencies conj (/ (- now (double pub-ns)) 1e6))))
                                   (swap! received + (count msgs)))))
       (let [pub-runnable (bound-fn []
                            (let [interval-ns (long (/ 1e9 pub-rate-msgs-sec))
                                  stop-at-ns  (+ (System/nanoTime) (* 1e9 duration-sec))]
                              (loop []
                                (when (and (not @stop?) (< (System/nanoTime) stop-at-ns))
                                  (let [next-pub-ns (+ (System/nanoTime) interval-ns)]
                                    (mq/with-queue queue-name [q]
                                      (mq/put q {:publish-ns (System/nanoTime)}))
                                    (swap! publisher-published inc)
                                    (let [sleep-ns (- next-pub-ns (System/nanoTime))]
                                      (when (pos? sleep-ns)
                                        (Thread/sleep (long (/ sleep-ns 1e6))
                                                      (int (mod sleep-ns 1e6)))))
                                    (recur))))))
             pub-thread (Thread. ^Runnable pub-runnable)
             start (System/nanoTime)]
         (.start pub-thread)
         (.join pub-thread (long (* 1000 (+ duration-sec 1))))
         (reset! stop? true)
         ;; Drain — wait for the consumer to catch up after publishing stops.
         (let [drain-deadline (+ (System/currentTimeMillis) 30000)]
           (while (and (< @received @publisher-published)
                       (< (System/currentTimeMillis) drain-deadline))
             (polling/notify-all!)
             (Thread/sleep 50)))
         (let [elapsed-ms (/ (- (System/nanoTime) start) 1e6)
               stats      (collect-stats @latencies)]
           (print-table!
            (str "Concurrent Pub+Consume (rate=" pub-rate-msgs-sec "/sec, duration=" duration-sec "s"
                 (when @rtt-ms (str ", rtt=" (first @rtt-ms) "-" (last @rtt-ms) "ms"))
                 ")")
            ["Metric" "Value"]
            [["Published"        (str @publisher-published)]
             ["Received"         (str @received)]
             ["Drain ms"         (fmt (- elapsed-ms (* 1000 duration-sec)))]
             ["P50 latency ms"   (fmt (:p50 stats))]
             ["P95 latency ms"   (fmt (:p95 stats))]
             ["P99 latency ms"   (fmt (:p99 stats))]
             ["Max latency ms"   (fmt (:max stats))]
             ["Pub/sec (actual)" (fmt (/ @publisher-published (double duration-sec)))]
             ["Recv/sec total"   (fmt (/ @received (/ elapsed-ms 1000.0)))]])))
       (finally
         (reset! stop? true)
         (mq/unlisten! queue-name)
         (t2/delete! :queue_message_batch :queue_name (name queue-name)))))))

;;; ---------------------------------------- Run All ----------------------------------------

(defn run-all-benchmarks!
  "Runs all benchmark scenarios with default parameters."
  []
  (println "=== MQ Performance Benchmarks ===")
  (println)

  (println "--- 1/5: Publishing Throughput ---")
  (bench-publish-throughput! {:n 1000})

  (println "--- 2/5: End-to-End Latency ---")
  (doseq [rate [:low :medium :high :burst]]
    (bench-e2e-latency! {:n 50 :rate rate}))

  (println "--- 3/5: Sustained Throughput ---")
  (bench-sustained-throughput! {:duration-sec 15 :rate :medium})

  (println "--- 4/5: Batch Listener Comparison ---")
  (bench-batch-listener! {:n 200})

  (println "--- 5/7: Multiple Queues ---")
  (bench-multi-queue! {:queue-counts [1 5 10 20] :msgs-per-queue 50})

  (println "--- 6/7: Concurrent Consumers ---")
  (bench-concurrent-consumers! {:consumer-counts [1 2 4 8] :n 2000})

  (println "--- 7/7: Stale Recovery Race ---")
  (bench-stale-recovery-race! {:n 500 :workers 8})

  (println "=== All benchmarks complete ==="))

;;; ---------------------------------------- Multi-Node Coordination ----------------------------------------

