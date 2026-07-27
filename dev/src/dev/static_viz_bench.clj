(ns dev.static-viz-bench
  "REPL benchmark harness for the static-viz consolidation spike: could built-in chart rendering move onto
  the SandboxPolicy/UNTRUSTED isolate alongside custom-viz plugins? Compares the trusted in-process path
  with isolate contexts loading either bundle, and probes isolate feasibility questions (Intl support,
  memory). Dev-only; nothing in production code depends on this namespace.

  Typical session:

    (require '[dev.static-viz-bench :as bench])
    (def inproc  (bench/make-inprocess-full-context))
    (def isolate (bench/make-isolate-context {:bundle :full}))
    (bench/bench-call isolate \"MetabaseStaticViz.renderChartJSON\" [payload-json] {:n 50})
    (bench/close! inproc) (bench/close! isolate)"
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.js.common :as js.common]
   [metabase.channel.render.js.graal :as js.graal]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.query-processor.core :as qp]
   [toucan2.core :as t2])
  (:import
   (java.lang ProcessHandle)
   (java.lang.management ManagementFactory ThreadMXBean)
   (org.graalvm.polyglot Context Context$Builder Engine HostAccess SandboxPolicy Value)))

(set! *warn-on-reflection* true)

;;; graal.clj privates the harness builds on (same pattern as svg-test)

(def ^:private create-engine*        @#'js.graal/create-engine)
(def ^:private build-source*         @#'js.graal/build-source)
(def ^:private eval-source*          @#'js.graal/eval-source)
(def ^:private new-untrusted-engine* @#'js.graal/new-untrusted-plugin-engine)
(def ^:private ^java.io.OutputStream discarding-out @#'js.graal/discarding-output-stream)

(defmacro ^:private timed-ms
  "Evaluate `body`, returning [result wall-clock-ms]."
  [& body]
  `(let [start# (System/nanoTime)
         ret#   (do ~@body)]
     [ret# (/ (- (System/nanoTime) start#) 1e6)]))

;;; ------------------------------------------ context builders -------------------------------------------

(def ^:private bundle-paths
  {:full js.common/bundle-resource-path
   :slim js.common/custom-viz-bundle-resource-path})

(defn make-inprocess-full-context
  "Trusted-tier equivalent: in-process engine + `create-context` with the full bundle evaluated from a
  URL-backed Source, like the production trusted pool. Returns {:engine :context :cold-ms} where :cold-ms
  breaks down engine-create / context-create / source-build / bundle-parse."
  []
  (let [[engine engine-ms]   (timed-ms (create-engine*))
        [context context-ms] (timed-ms (js.graal/create-context engine))
        [source source-ms]   (timed-ms (build-source* js.common/bundle-resource-path))
        [_ parse-ms]         (timed-ms (eval-source* context source))]
    {:engine  engine
     :context context
     :cold-ms {:engine engine-ms :context context-ms :source-build source-ms :parse parse-ms}}))

(defn make-isolate-context
  "Untrusted-tier context: isolate engine + `untrusted-plugin-context` with `:bundle` (`:full` or `:slim`,
  default :full) loaded as a literal Source, like the production untrusted pool. `:cpu-budget` defaults to
  600s so the benchmark itself never trips sandbox.MaxCPUTime. Returns the same shape as
  [[make-inprocess-full-context]]."
  [{:keys [bundle cpu-budget] :or {bundle :full, cpu-budget "600s"}}]
  (let [[engine engine-ms]   (timed-ms (new-untrusted-engine*))
        [context context-ms] (timed-ms (js.graal/untrusted-plugin-context engine cpu-budget))
        [_ parse-ms]         (timed-ms (js.graal/load-resource context (bundle-paths bundle)))]
    {:engine  engine
     :context context
     :cold-ms {:engine engine-ms :context context-ms :parse parse-ms}}))

(defn close!
  "Close a context map returned by the builders (context first, then its engine)."
  [{:keys [^Context context ^Engine engine]}]
  (try (.close context true) (catch Exception _))
  (try (.close engine) (catch Exception _)))

(defn loaded-interface
  "Sanity check: `typeof` of the MetabaseStaticViz entry points in `ctx`'s context."
  [{:keys [^Context context]}]
  (into {}
        (for [fn-name ["renderChartJSON" "getCellBackgroundColorsJSON" "initializeContextJSON"]]
          [fn-name (.asString (.eval context "js" (str "typeof MetabaseStaticViz." fn-name)))])))

;;; ------------------------------------------- timing harness --------------------------------------------

(defn- round2 ^double [x] (/ (Math/round (* 100.0 (double x))) 100.0))

(defn- percentile [xs p]
  (let [sorted (vec (sort xs))]
    (nth sorted (min (dec (count sorted)) (int (Math/floor (* p (count sorted))))))))

(defn- stats [xs]
  {:min    (round2 (apply min xs))
   :median (round2 (percentile xs 0.5))
   :p95    (round2 (percentile xs 0.95))
   :max    (round2 (apply max xs))
   :mean   (round2 (/ (reduce + xs) (count xs)))})

(defn bench-call
  "Call the global js function `fn-name` with (already-JSON-encoded) string `json-args` `:n` times on
  `ctx`'s context, forcing the result string across the boundary each call. Per-call wall and calling-thread
  CPU time in ms (the isolate guest executes synchronously on the calling thread, so thread CPU approximates
  guest CPU burn against sandbox.MaxCPUTime, plus host-side overhead). The warmup curve (first-10 vs last-10
  medians) exposes the isolate JIT vs in-process interpreter difference; :total-cpu-ms is the input for
  renders-per-CPU-budget projections."
  [{:keys [^Context context]} fn-name json-args {:keys [n] :or {n 50}}]
  (let [^ThreadMXBean tmx (ManagementFactory/getThreadMXBean)
        samples (vec (for [_ (range n)]
                       (let [cpu0   (.getCurrentThreadCpuTime tmx)
                             t0     (System/nanoTime)
                             result (.asString ^Value (apply js.graal/execute-fn-name context fn-name json-args))
                             t1     (System/nanoTime)
                             cpu1   (.getCurrentThreadCpuTime tmx)]
                         {:wall       (/ (- t1 t0) 1e6)
                          :cpu        (/ (- cpu1 cpu0) 1e6)
                          :result-len (count result)})))
        walls   (map :wall samples)]
    {:n            n
     :result-len   (:result-len (first samples))
     :wall         (stats walls)
     :cpu          (stats (map :cpu samples))
     :warmup-curve {:first10-median (round2 (percentile (take 10 walls) 0.5))
                    :last10-median  (round2 (percentile (take-last 10 walls) 0.5))}
     :total-cpu-ms (round2 (reduce + (map :cpu samples)))}))

;;; ---------------------------------------- feasibility probes -------------------------------------------

(defn intl-probe
  "Q4: is `js.intl-402` (set on the trusted context for locale-aware formatting) available under
  SandboxPolicy/UNTRUSTED? Builds one plain untrusted context (baseline: is Intl there by default?) and one
  with the option set (does the sandbox policy accept it?), then exercises Number/Date formatting. Returns a
  result map; never throws."
  []
  (let [^Engine engine (new-untrusted-engine*)
        base-builder   (fn []
                         (.. (Context/newBuilder (into-array String ["js"]))
                             (engine engine)
                             (sandbox SandboxPolicy/UNTRUSTED)
                             (allowHostAccess HostAccess/UNTRUSTED)
                             (option "sandbox.MaxCPUTime" "30s")
                             (option "sandbox.MaxHeapMemory" "416MB")
                             (option "sandbox.MaxASTDepth" "5000")
                             (option "sandbox.MaxThreads" "1")
                             (option "sandbox.MaxOutputStreamSize" "16MB")
                             (option "sandbox.MaxErrorStreamSize" "4MB")
                             (out discarding-out)
                             (err discarding-out)))
        exercise       (fn [^Context ctx]
                         (try
                           {:typeof-Intl   (.asString (.eval ctx "js" "typeof Intl"))
                            :number-format (.asString (.eval ctx "js" "typeof Intl === 'undefined' ? 'n/a' : new Intl.NumberFormat('de-DE').format(1234567.891)"))
                            :date-format   (.asString (.eval ctx "js" "typeof Intl === 'undefined' ? 'n/a' : new Intl.DateTimeFormat('en-US').format(new Date(1700000000000))"))}
                           (finally (.close ctx true))))]
    (try
      {:baseline  (exercise (.build ^Context$Builder (base-builder)))
       :with-intl (try
                    (assoc (exercise (.build (.option ^Context$Builder (base-builder) "js.intl-402" "true")))
                           :option-accepted true)
                    (catch Exception e
                      {:option-accepted false :error (str e)}))}
      (finally (try (.close engine) (catch Exception _))))))

;;; ------------------------------------------- payload capture -------------------------------------------

(def payloads-dir
  "Where captured render payloads land (gitignored). One file per trusted-tier `call-js` call: the single
  already-JSON-encoded argument, named `<fn-name>-NNN.json`."
  "local/static-viz-bench-payloads")

(defonce ^:private capture-original (atom nil))

(defn start-capture!
  "Wrap `#'js.graal/call-js` so every trusted-tier render dumps its argument JSON into [[payloads-dir]]
  before rendering normally. Idempotent; restore with [[stop-capture!]]."
  []
  (when (compare-and-set! capture-original nil @#'js.graal/call-js)
    (let [counter (atom 0)]
      (alter-var-root #'js.graal/call-js
                      (fn [orig]
                        (fn [fn-name args]
                          (let [f (io/file payloads-dir (format "%s-%03d.json" fn-name (swap! counter inc)))]
                            (io/make-parents f)
                            (spit f (first args)))
                          (orig fn-name args))))))
  :capturing)

(defn stop-capture!
  "Undo [[start-capture!]]."
  []
  (when-let [orig @capture-original]
    (alter-var-root #'js.graal/call-js (constantly orig))
    (reset! capture-original nil))
  :stopped)

(defn render-dashboard-for-capture!
  "Render every card of `dashboard-id` through the same pulse/subscription pipeline as
  [[dev.render-png/render-dashboard-to-pngs]], but without producing/opening PNGs — just enough to drive
  the wrapped `call-js` (see [[start-capture!]]) with real payloads. Returns a per-card summary."
  [dashboard-id]
  (let [user (t2/select-one :model/User :is_superuser true)]
    (vec (for [{:keys [card dashcard result]} (notification.payload/execute-dashboard dashboard-id (:id user) nil)
               :when card]
           (do
             (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card dashcard result)
             {:card-id (:id card), :name (:name card), :display (:display card)})))))

(defn synthesize-cell-colors-payload!
  "Tables only call `getCellBackgroundColorsJSON` when they have `:table.column_formatting` rules, so a
  dashboard without conditional formatting captures none. Produce a realistic call by running `card-id`'s
  query and evaluating a range rule over its first numeric column, with `cells` built the way
  [[metabase.channel.render.table/render-table]] builds them (every cell of the first `:visible-rows` rows,
  default 20). Call between [[start-capture!]] and [[stop-capture!]] to dump the payload."
  [card-id & {:keys [visible-rows] :or {visible-rows 20}}]
  (let [card    (t2/select-one :model/Card :id card-id)
        results (qp/process-query (:dataset_query card))
        cols    (get-in results [:data :cols])
        rows    (get-in results [:data :rows])
        num-col (some #(when (#{:type/Integer :type/BigInteger :type/Float :type/Decimal} (:base_type %))
                         (:name %))
                      cols)
        vs      {:table.column_formatting [{:columns  [num-col]
                                            :type     "range"
                                            :colors   ["#ED6E6E" "#FFFFFF" "#84BB4C"]
                                            :min_type nil
                                            :max_type nil}]}
        cells   (vec (for [[ri row] (map-indexed vector (take visible-rows rows))
                           [ci v]   (map-indexed vector row)]
                       [v ri (:name (nth cols ci))]))
        colors  (js.color/cell-background-colors {:cols cols :rows rows} vs cells)]
    {:rule-column num-col
     :rows        (count rows)
     :cells       (count cells)
     :colored     (count (remove nil? colors))}))

(defn process-rss-mb
  "Resident set size of this JVM process in MB (via `ps`): isolate heaps are native memory invisible to JVM
  heap metrics, so RSS deltas around context creation/rendering are how we see them."
  []
  (let [pid (.pid (ProcessHandle/current))
        out (:out (sh/sh "ps" "-o" "rss=" "-p" (str pid)))]
    (some-> out str/trim parse-long (/ 1024.0) round2)))
