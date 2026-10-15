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

  Transactional modes (`:mode`): every benchmark takes a `:mode` selecting which publish path in
  `metabase.mq.publish` it drives — this is what makes the QRTZ pressure differ dramatically:

    :none-no-txn — `:never` queue, published *outside* a transaction. Immediate publish through the
                   sliding-window buffer, which coalesces across publishers (few, fat triggers).
    :none-in-txn — `:never` queue, published *inside* a transaction. Deferred to after-commit (in
                   memory, no outbox table), then goes through the same buffer — still coalesced.
    :require     — `:require` queue, published *inside* a transaction (mandatory — throws otherwise).
                   Messages are written to the `queue_message_outbox` table in the business txn and
                   published *directly to the backend at commit*, BYPASSING the buffer. So there is
                   no cross-transaction coalescing: one committed publish ≈ one trigger. This is the
                   durable path, and its trigger rate tracks the message rate — the QRTZ tables feel
                   every message. (See the perf note on `def-queue!`.)

  So the same message rate produces wildly different trigger counts across modes; the benchmarks
  report `:mode`, triggers fired, and the coalescing factor so the tradeoff is visible.

  Usage (in the dev REPL, with the system started):

    (require 'dev.mq-perf)
    (dev.mq-perf/run-all!)                 ; sweeps every mode
    (dev.mq-perf/bench-sustained! {:duration-sec 10 :target-msgs-sec 2000 :mode :require})
    (dev.mq-perf/bench-e2e-latency! {:n 500 :msgs-sec 500 :mode :none-in-txn})
    (dev.mq-perf/bench-publish-throughput! {:n 5000 :mode :none-no-txn})"
  (:require
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz JobKey JobListener Scheduler)
   (org.quartz.impl.matchers GroupMatcher)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- helpers ---------------------------------------------

(defn- ensure-queue!
  ([ch] (ensure-queue! ch {:transactional :try}))
  ([ch config] (when-not (q.registry/get-queue ch) (q.registry/register-queue! ch config))))

(def scenarios
  "Publish paths the harness exercises, each selecting a distinct route through
  `metabase.mq.publish/publish-collected!`. `:transactional` is the queue's declared mode; `:in-txn?`
  is whether the benchmark wraps each publish in a DB transaction. See the ns docstring for details."
  {:none-no-txn {:transactional :never   :in-txn? false}
   :none-in-txn {:transactional :never   :in-txn? true}
   :require     {:transactional :require :in-txn? true}})

(defn- scenario-queue
  "Per-mode queue name, so the three modes never collide on config (a queue is registered once)."
  [base mode]
  (keyword "queue" (str base "-" (name mode))))

(defn- mode-config
  "Queue config for `mode`, merged with any `extra` (e.g. `:max-batch-messages`)."
  [mode extra]
  (merge {:transactional (:transactional (scenarios mode))} extra))

(defn- putter
  "Returns `(fn [msg])` publishing one message to `ch` on `mode`'s path — wrapping the publish in a DB
  transaction for the transactional modes so `:require` hits the outbox and `:none-in-txn` hits the
  after-commit defer."
  [ch mode]
  (if (:in-txn? (scenarios mode))
    (fn [msg] (t2/with-transaction [_conn] (mq/with-queue ch [q] (mq/put q msg))))
    (fn [msg] (mq/with-queue ch [q] (mq/put q msg)))))

(defn- outbox-depth
  "Rows still sitting in the transactional outbox for `ch` — should be 0 after a clean run (the
  after-commit path deletes each row once it's published). A non-zero value means publishes are being
  left for the recovery sweep, i.e. the backend couldn't keep up at commit time."
  [ch]
  (t2/count :queue_message_outbox :queue_name (name ch)))

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
  leftover triggers) so a benchmark run leaves the scheduler tidy.

  Also evicts the bench queues from the quartz backend's private `ensured-jobs` process cache. That
  cache is deliberately trusted over the scheduler on the publish hot path, so without this eviction
  a *re-run* of a same-named benchmark would skip recreating the just-deleted durable job and every
  publish would throw `JobPersistenceException` (silently dropped by the publish buffer → 0 delivered)."
  []
  (doseq [ch (keys @q.registry/*queues*)
          :when (.startsWith (name ch) "bench-")]
    (try (mq/unlisten! ch) (catch Throwable _))
    (swap! q.registry/*queues* dissoc ch))
  ;; `ensured-jobs` is private to the quartz backend; reach it via its var (dev harness only).
  (swap! @#'q.quartz/ensured-jobs (fn [s] (into #{} (remove (fn [[ch _]] (.startsWith (name ch) "bench-"))) s)))
  (when-let [^Scheduler scheduler (task/scheduler)]
    (doseq [^JobKey jk (.getJobKeys scheduler (GroupMatcher/jobGroupEquals "metabase.mq.queue"))
            :when (.startsWith (.getName jk) "bench-")]
      (.deleteJob scheduler jk))))

;;; --------------------------------------------- benchmarks ---------------------------------------------

(defn bench-publish-throughput!
  "How fast can the publish side enqueue + schedule triggers? Publishes `n` single-message batches
  as fast as possible (buffer flushed at the end), measuring publish-side msgs/sec. Does not wait
  for delivery. `:mode` selects the publish path (see [[scenarios]]); the transactional modes pay a
  DB round-trip per message, so this is where their per-publish cost shows up."
  [{:keys [n mode] :or {n 5000 mode :none-no-txn}}]
  (let [ch  (scenario-queue "bench-pub" mode)
        put (putter ch mode)]
    (ensure-queue! ch (mode-config mode nil))
    (let [start (System/nanoTime)]
      (publish-at-rate! n nil (fn [i] (put {:i i})))
      (publish-buffer/flush-publish-buffer!)
      (let [secs (/ (- (System/nanoTime) start) 1e9)]
        {:bench :publish-throughput :mode mode :n n
         :elapsed-sec (fmt secs) :msgs-sec (fmt (/ n secs))}))))

(defn bench-e2e-latency!
  "Publishes `n` messages at ~`msgs-sec` and measures publish->receive latency (ms) percentiles
  through the full pipeline (buffer -> quartz trigger -> worker thread -> listener)."
  [{:keys [n msgs-sec mode] :or {n 500 msgs-sec 500 mode :none-no-txn}}]
  (let [ch        (scenario-queue "bench-e2e" mode)
        put       (putter ch mode)
        latencies (atom [])
        received  (atom 0)]
    (ensure-queue! ch (mode-config mode nil))
    (listener/batch-listen! ch (fn [msgs]
                                 (let [now (System/nanoTime)]
                                   (doseq [m msgs]
                                     (when-let [p (:pub-ns m)]
                                       (swap! latencies conj (/ (- now (double p)) 1e6)))
                                     (swap! received inc)))))
    (try
      (publish-at-rate! n msgs-sec (fn [_] (put {:pub-ns (System/nanoTime)})))
      (publish-buffer/flush-publish-buffer!)
      (let [deadline (+ (System/currentTimeMillis) 30000)]
        (while (and (< @received n) (< (System/currentTimeMillis) deadline))
          (Thread/sleep 50)))
      (merge {:bench :e2e-latency :mode mode :published n :received @received :target-msgs-sec msgs-sec}
             (update-vals (select-keys (stats @latencies) [:p50 :p95 :p99 :min :max :avg]) fmt))
      (finally (mq/unlisten! ch)))))

(defn bench-sustained!
  "Publishes at ~`target-msgs-sec` for `duration-sec`, then drains. Reports delivered messages/sec,
  the number of Quartz triggers actually fired, and the resulting coalescing factor (messages per
  trigger). `:mode` selects the publish path (see [[scenarios]]): the buffered modes coalesce so the
  trigger rate stays flat, while `:require` publishes each committed batch straight to the backend so
  the trigger rate tracks the message rate — compare `:triggers-sec` / `:msgs-per-trigger` across
  modes to see the QRTZ pressure tradeoff. `:outbox-remaining` should be 0 (rows deleted on publish)."
  [{:keys [duration-sec target-msgs-sec max-batch mode]
    :or   {duration-sec 10 target-msgs-sec 2000 max-batch 100 mode :none-no-txn}}]
  (let [ch       (scenario-queue (str "bench-sustained-mb" max-batch) mode)
        put      (putter ch mode)
        received (atom 0)]
    (ensure-queue! ch (mode-config mode {:max-batch-messages max-batch}))
    (listener/batch-listen! ch (fn [msgs] (swap! received + (count msgs))))
    (try
      (let [n (* duration-sec target-msgs-sec)
            [result triggers]
            (do-with-trigger-count!
             (fn []
               (let [start (System/nanoTime)]
                 (publish-at-rate! n target-msgs-sec (fn [i] (put {:i i})))
                 (publish-buffer/flush-publish-buffer!)
                 (let [pub-secs (/ (- (System/nanoTime) start) 1e9)
                       deadline (+ (System/currentTimeMillis) 60000)]
                   (while (and (< @received n) (< (System/currentTimeMillis) deadline))
                     (Thread/sleep 100))
                   {:pub-secs pub-secs :total-secs (/ (- (System/nanoTime) start) 1e9)}))))]
        {:bench :sustained :mode mode :target-msgs-sec target-msgs-sec :duration-sec duration-sec :max-batch max-batch
         :published n :received @received :outbox-remaining (outbox-depth ch)
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

(defn run-modes!
  "Runs the sustained throughput benchmark across all three [[scenarios]] at the same message rate so
  the QRTZ-pressure tradeoff is directly comparable. `clean!`s between modes so each starts fresh.
  `:require` pays a DB round-trip per publish, so it defaults to a gentler rate."
  [{:keys [duration-sec target-msgs-sec require-msgs-sec]
    :or   {duration-sec 10 target-msgs-sec 2000 require-msgs-sec 500}}]
  (mapv (fn [mode]
          (log/infof "MQ quartz perf: sustained (%s)" (name mode))
          (clean!)
          (bench-sustained! {:duration-sec    duration-sec
                             :target-msgs-sec (if (= mode :require) require-msgs-sec target-msgs-sec)
                             :mode            mode}))
        [:none-no-txn :none-in-txn :require]))

(defn run-all!
  "Runs the standard suite (publish throughput, e2e latency, then a sustained sweep across every
  transactional mode) and returns a vector of result maps. Assumes the system is already up (use
  [[start-system!]] first in a headless process)."
  []
  (log/info "MQ quartz perf: publish throughput")
  (let [r1 (bench-publish-throughput! {:n 5000})]
    (log/info "MQ quartz perf: e2e latency")
    (let [r2 (bench-e2e-latency! {:n 500 :msgs-sec 500})]
      (log/info "MQ quartz perf: sustained throughput (all modes)")
      (into [r1 r2] (run-modes! {:duration-sec 10 :target-msgs-sec 2000})))))
