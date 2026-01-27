(ns metabase.driver.sql.sqlglot
  "Basic example of running Python code using GraalVM polyglot."
  (:require
   [cheshire.core :as json]
   [metabase.config.core :as config]
   [potemkin :as p])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools)
   (java.io Closeable)
   (java.util.concurrent TimeUnit)
   (org.graalvm.polyglot Context HostAccess Source Value)))

;; 1. Install sqlglot into resources
;; pip install sqlglot --target resources/python-libs --no-compile

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Protocol --------------------------------------------------------

(defprotocol PythonEval
  "Protocol for evaluating Python code. Abstracts over raw Context and pooled contexts."
  (eval-python [this code]
    "Evaluate Python code."))

;;; -------------------------------------------- Context Wrappers ----------------------------------------------------

(p/defrecord+ PooledContext [^Context context ^Pool pool tuple]
  PythonEval
  (eval-python [_this code]
    (.eval context "python" ^String code))

  Closeable
  (close [_this]
    (.release pool :python tuple)))

(p/defrecord+ DevContext [^Context context]
  PythonEval
  (eval-python [_this code]
    (.eval context "python" ^String code))

  Closeable
  (close [_this]
    nil))

(defn- create-graalvm-context
  "Create a new GraalVM Python context configured for sqlglot."
  ^Context []
  (.. (Context/newBuilder (into-array String ["python"]))
      (option "engine.WarnInterpreterOnly" "false")
      (option "python.PythonPath" "python-sources")
      (allowHostAccess HostAccess/ALL)
      (allowIO true)
      (build)))

(defn- acquire-dev-context
  "Create a dev context (not pooled, but still Closeable for consistent API)."
  []
  (->DevContext (create-graalvm-context)))

(defn- make-python-context-pool
  "Create a pool of Python contexts. Accepts a generator function and optional config map.

  Config options:
  - :max-size          - Maximum pool size (default: 3)
  - :min-size          - Minimum pool size (default: 1)
  - :ttl-minutes       - How long contexts live before expiry (default: 10)
  - :utilization       - Target utilization (default: 1.0 = 100%)

  This allows for easy testing by injecting mock context generators and custom pool configs."
  ([context-generator]
   (make-python-context-pool context-generator {}))
  ([context-generator {:keys [max-size min-size ttl-minutes utilization]
                       :or {max-size 3
                            min-size 1
                            ttl-minutes 10
                            utilization 1.0}}]
   (let [base-controller (Pools/utilizationController utilization max-size max-size)]
     (Pool. (reify IPool$Generator
              (generate [_ _]
                ;; Generate a tuple of the context and the expiry timestamp.
                [(context-generator)
                 (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES ttl-minutes))])
              (destroy [_ _ _v]))
            ;; Wrap the utilization controller with a modification that doesn't allow the pool to go below min-size.
            (reify IPool$Controller
              (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
              (adjustment [_ stats]
                (let [adj (.adjustment base-controller stats)
                      ;; :python is arbitrary key, it just has to be consistent everywhere when working with the pool.
                      n (some-> ^io.aleph.dirigiste.Stats (:python stats) .getNumWorkers)
                      python-adj (:python adj)]
                  (if (and n python-adj (<= (+ n python-adj) min-size))
                    ;; If the adjustment is going to bring the pool below min-size, return empty adjustment instead.
                    {}
                    adj))))
            65000 ;; Queue size - doesn't matter much.
            25 ;; Sampling interval - doesn't matter much.
            10000 ;; Recheck every 10 seconds
            TimeUnit/MILLISECONDS))))

(def ^:private python-context-pool
  "Pool of Python context objects. They are not thread-safe, so access to them has to be carefully managed between
  threads. Each context with loaded Python interpreter takes significant memory, so we don't want too many of them.
  However, one takes significant time to initialize, so we don't want to load them anew each time in prod. Under some
  circumstances, the GraalVM Python context tends to leak memory, so we don't want to keep the reference to the
  context forever. Considering all that, this pool targets 100% utilization (so, if the utilization is lower, the pool
  will start dropping objects) and the maximum of 3 objects (to prevent OOMs), but at least 1 object will always be in
  the pool to pick up. However, together with each context keep its creation timestamp so that we can throwaway
  instances that are too old to avoid leaks.

  Wrapped in delay to avoid initialization during AOT compilation."
  (delay (make-python-context-pool create-graalvm-context {:max-size 3
                                                           :min-size 1
                                                           :ttl-minutes 10})))

(defn- acquire-context
  "Acquire a context from the pool, handling expiry. Returns a PooledContext."
  [^Pool pool]
  (loop []
    (let [[context expiry-ts :as tuple] (.acquire pool :python)]
      (if (>= (System/nanoTime) expiry-ts)
        (do (.dispose pool :python tuple)
            (recur))
        (->PooledContext context pool tuple)))))

(comment
  ;; Public API usage:
  (analyze-sql "SELECT id FROM users")
  (p "SELECT id FROM users")

  ;; Using with-open for manual pool management:
  (with-open [ctx (acquire-context @python-context-pool)]
    (eval-python ctx "import sqlglot")
    (eval-python ctx "sqlglot.parse_one('SELECT 1')")))

(defn- analyze-sql-impl
  "Internal implementation that takes a context (either raw Context or PooledContext)."
  ^Value [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (eval-python context "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-fn (eval-python context "sql_tools.analyze")]

    ;; 3. Call it directly with arguments
    ;; GraalVM handles the conversion of the Clojure string to a Python string
    (.execute ^Value analyze-fn (object-array [sql]))))

(defn analyze-sql
  "Analyze SQL using sqlglot. Uses a pooled Python context for thread-safety."
  [sql]
  (with-open [^Closeable ctx (if config/is-dev?
                               (acquire-dev-context)
                               (acquire-context @python-context-pool))]
    (analyze-sql-impl ctx sql)))

(defn p
  "Parse and analyze SQL, returning the result as a Clojure data structure."
  [sql]
  ;; todo: the shim doesn't 100% return json. need to fix that
  ;;   sqlglot=> (p "-- FIXTURE: interpolation/crosstab
  ;; SELECT * FROM crosstab($$

  ;;     SELECT
  ;;         history.page,
  ;;         date_trunc('month', history.h_timestamp)::DATE,
  ;;         count(history.id) as total
  ;;     FROM history
  ;;     WHERE h_timestamp between '2024-01-01' and '2024-12-01'
  ;;     GROUP BY page, date_trunc('month', history.h_timestamp)
  ;; $$,

  ;;         $$
  ;;             SELECT
  ;;                 date_trunc('month', generate_series('2024-01-01', '2024-02-01', '1 month'::INTERVAL))::DATE
  ;; $$
  ;; ) AS ct(
  ;;     page INTEGER,
  ;;     \"Jan\" FLOAT,
  ;;     \"Feb\" FLOAT
  ;; )")
  ;; Execution error (PolyglotException) at <python>/default (encoder.py:161).
  ;; TypeError: Object of type Type is not JSON serializable
  (json/parse-string (.asString ^Value (analyze-sql sql)) true))
