(ns dev.mq-perf
  "Load/perf harness for the **Quartz** MQ backend (`metabase.mq.queue.quartz`).

  Unlike the old appdb harness this drives the real Quartz path: each published batch becomes a
  trigger on a per-queue durable job, fired by Quartz's worker pool. It therefore needs a running
  Quartz scheduler with the JDBC JobStore — i.e. run it inside a normal dev system (the dev REPL
  already has `db` + scheduler + mq up) rather than the old `start-mq!` standalone mode.

  Key thing to watch: the publish buffer coalesces messages published close together into one
  batch (one trigger carrying up to `:max-batch-messages` messages). So Quartz fires far fewer
  triggers than there are messages — the benchmarks report both message throughput and the trigger
  count / coalescing factor, since the trigger rate is what actually stresses the QRTZ_* tables.

  Usage (in the dev REPL, with the system started):

    (require 'dev.mq-perf)
    (dev.mq-perf/run-all! )
    (dev.mq-perf/bench-sustained! {:duration-sec 10 :target-msgs-sec 2000})
    (dev.mq-perf/bench-e2e-latency! {:n 500 :msgs-sec 500})
    (dev.mq-perf/bench-publish-throughput! {:n 5000})"
  (:require
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz JobKey JobListener Scheduler)
   (org.quartz.impl.matchers GroupMatcher)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- helpers ---------------------------------------------

(defn- ensure-queue!
  ([ch] (ensure-queue! ch {:transactional :try}))
  ([ch config] (when-not (q.registry/get-queue ch) (q.registry/register-queue! ch config))))

(defn- pct [sorted p]
  (when (seq sorted)
    (nth sorted (min (dec (count sorted)) (long (* p (count sorted)))))))

(defn- stats [xs]
  (let [s (vec (sort xs))]
    {:n (count s) :min (first s) :max (peek s)
     :p50 (pct s 0.50) :p95 (pct s 0.95) :p99 (pct s 0.99)
     :avg (when (seq s) (/ (reduce + 0.0 s) (count s)))}))

(defn- fmt [x] (when x (format "%.2f" (double x))))

(defn- publish-at-rate!
  "Calls `(f i)` `n` times, pacing to ~`msgs-sec` (nil = as fast as possible)."
  [n msgs-sec f]
  (let [interval-ns (when (and msgs-sec (pos? msgs-sec)) (long (/ 1e9 msgs-sec)))
        start       (System/nanoTime)]
    (dotimes [i n]
      (f i)
      (when interval-ns
        (let [target (+ start (* (long (inc i)) interval-ns))
              now    (System/nanoTime)]
          (when (> target now)
            (let [sleep-ms (long (/ (- target now) 1e6))]
              (when (pos? sleep-ms) (Thread/sleep sleep-ms)))))))))

(defn- do-with-trigger-count!
  "Counts actual Quartz job executions (= triggers fired) in the mq group while `thunk` runs, via a
  temporary JobListener. Returns `[thunk-result trigger-count]`. This is the true trigger rate — not
  the listener-invocation count, which is inflated by max-batch-messages slicing."
  [thunk]
  (let [^Scheduler scheduler (task/scheduler)
        counter   (atom 0)
        lname     "mq-perf-trigger-counter"
        jl        (reify JobListener
                    (getName [_] lname)
                    (jobToBeExecuted [_ _ctx])
                    (jobExecutionVetoed [_ _ctx])
                    (jobWasExecuted [_ _ctx _ex] (swap! counter inc)))]
    (.addJobListener (.getListenerManager scheduler) jl (GroupMatcher/jobGroupEquals "metabase.mq.queue"))
    (try
      [(thunk) @counter]
      (finally (.removeJobListener (.getListenerManager scheduler) lname)))))

(defn clean!
  "Unlisten + drop all `:queue/bench-*` queues and delete their durable Quartz jobs (and any
  leftover triggers) so a benchmark run leaves the scheduler tidy."
  []
  (doseq [ch (keys @q.registry/*queues*)
          :when (.startsWith (name ch) "bench-")]
    (try (mq/unlisten! ch) (catch Throwable _))
    (swap! q.registry/*queues* dissoc ch))
  (when-let [^Scheduler scheduler (task/scheduler)]
    (doseq [^JobKey jk (.getJobKeys scheduler (GroupMatcher/jobGroupEquals "metabase.mq.queue"))
            :when (.startsWith (.getName jk) "bench-")]
      (.deleteJob scheduler jk))))

;;; --------------------------------------------- benchmarks ---------------------------------------------

(defn bench-publish-throughput!
  "How fast can the publish side enqueue + schedule triggers? Publishes `n` single-message batches
  as fast as possible (buffer flushed at the end), measuring publish-side msgs/sec. Does not wait
  for delivery."
  [{:keys [n] :or {n 5000}}]
  (let [ch :queue/bench-pub]
    (ensure-queue! ch)
    (let [start (System/nanoTime)]
      (publish-at-rate! n nil (fn [i] (mq/with-queue ch [q] (mq/put q {:i i}))))
      (publish-buffer/flush-publish-buffer!)
      (let [secs (/ (- (System/nanoTime) start) 1e9)]
        {:bench :publish-throughput :n n
         :elapsed-sec (fmt secs) :msgs-sec (fmt (/ n secs))}))))

(defn bench-e2e-latency!
  "Publishes `n` messages at ~`msgs-sec` and measures publish->receive latency (ms) percentiles
  through the full pipeline (buffer -> quartz trigger -> worker thread -> listener)."
  [{:keys [n msgs-sec] :or {n 500 msgs-sec 500}}]
  (let [ch        :queue/bench-e2e
        latencies (atom [])
        received  (atom 0)]
    (ensure-queue! ch)
    (listener/batch-listen! ch (fn [msgs]
                                 (let [now (System/nanoTime)]
                                   (doseq [m msgs]
                                     (when-let [p (:pub-ns m)]
                                       (swap! latencies conj (/ (- now (double p)) 1e6)))
                                     (swap! received inc)))))
    (try
      (publish-at-rate! n msgs-sec (fn [_] (mq/with-queue ch [q] (mq/put q {:pub-ns (System/nanoTime)}))))
      (publish-buffer/flush-publish-buffer!)
      (let [deadline (+ (System/currentTimeMillis) 30000)]
        (while (and (< @received n) (< (System/currentTimeMillis) deadline))
          (Thread/sleep 50)))
      (merge {:bench :e2e-latency :published n :received @received :target-msgs-sec msgs-sec}
             (update-vals (select-keys (stats @latencies) [:p50 :p95 :p99 :min :max :avg]) fmt))
      (finally (mq/unlisten! ch)))))

(defn bench-sustained!
  "Publishes at ~`target-msgs-sec` for `duration-sec`, then drains. Reports delivered messages/sec,
  the number of Quartz triggers actually fired (listener invocations), and the resulting coalescing
  factor (messages per trigger)."
  [{:keys [duration-sec target-msgs-sec max-batch]
    :or   {duration-sec 10 target-msgs-sec 2000 max-batch 100}}]
  (let [ch       (keyword "queue" (str "bench-sustained-mb" max-batch))
        received (atom 0)]
    (ensure-queue! ch {:transactional :try :max-batch-messages max-batch})
    (listener/batch-listen! ch (fn [msgs] (swap! received + (count msgs))))
    (try
      (let [n (* duration-sec target-msgs-sec)
            [result triggers]
            (do-with-trigger-count!
             (fn []
               (let [start (System/nanoTime)]
                 (publish-at-rate! n target-msgs-sec (fn [i] (mq/with-queue ch [q] (mq/put q {:i i}))))
                 (publish-buffer/flush-publish-buffer!)
                 (let [pub-secs (/ (- (System/nanoTime) start) 1e9)
                       deadline (+ (System/currentTimeMillis) 60000)]
                   (while (and (< @received n) (< (System/currentTimeMillis) deadline))
                     (Thread/sleep 100))
                   {:pub-secs pub-secs :total-secs (/ (- (System/nanoTime) start) 1e9)}))))]
        {:bench :sustained :target-msgs-sec target-msgs-sec :duration-sec duration-sec :max-batch max-batch
         :published n :received @received
         :publish-sec (fmt (:pub-secs result)) :total-sec (fmt (:total-secs result))
         :delivered-msgs-sec (fmt (/ @received (:total-secs result)))
         :triggers-fired triggers
         :triggers-sec (fmt (/ triggers (:total-secs result)))
         :msgs-per-trigger (fmt (/ @received (max 1 triggers)))})
      (finally (mq/unlisten! ch)))))

(defn start-system!
  "Headless bootstrap for a benchmark node: app DB + Quartz scheduler + MQ subsystem (no Jetty).
  Idempotent enough for a fresh process. Point `MB_DB_*` at a DEDICATED database — running several
  nodes against the same DB exercises Quartz clustering, but aiming at a live instance's DB would
  make this node also run that instance's scheduled jobs."
  []
  ((requiring-resolve 'metabase.app-db.core/setup-db!) :create-sample-content? false)
  ((requiring-resolve 'metabase.task.core/start-scheduler!))
  (require 'metabase.mq.init)
  ;; invoking the startup-logic method for ::MqStart runs mq.init/start!
  ((requiring-resolve 'metabase.startup.core/def-startup-logic!) :metabase.mq.init/MqStart)
  (log/info "MQ benchmark node started (DB + scheduler + MQ)."))

(defn run-all!
  "Runs the standard suite and returns a vector of result maps. Assumes the system is already up
  (use [[start-system!]] first in a headless process)."
  []
  (log/info "MQ quartz perf: publish throughput")
  (let [r1 (bench-publish-throughput! {:n 5000})]
    (log/info "MQ quartz perf: e2e latency")
    (let [r2 (bench-e2e-latency! {:n 500 :msgs-sec 500})]
      (log/info "MQ quartz perf: sustained throughput")
      (let [r3 (bench-sustained! {:duration-sec 10 :target-msgs-sec 2000})]
        [r1 r2 r3]))))
