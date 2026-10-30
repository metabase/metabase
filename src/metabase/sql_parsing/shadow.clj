(ns metabase.sql-parsing.shadow
  "A [[metabase.sql-parsing.protocol/SqlParser]] that answers with one parser and runs a second on the same input in
  the background, to measure how often they agree before the second one is trusted with answers.

  The caller gets the primary parser's value, or its exception, unchanged, and never waits for the shadow parser:
  everything else here, sampling and metrics included, runs on the background thread or cannot throw. The comparison
  produces Prometheus counts, and a log line when the parsers differ that names the method, the dialect and the
  caller's thread, so the logs around it show what was being parsed. Nothing here logs SQL or a parser's error
  message, since both can hold customer SQL.

  The parsers are compared on what callers get from [[metabase.sql-parsing.core]] (the tables, the fields, the
  verdict, the SQL as tokens), not on the raw values a parser returns: two parsers that differ only in shape, layout
  or the wording of a message agree."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.analytics-interface.core :as analytics]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.results :as results]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ArrayBlockingQueue RejectedExecutionException ThreadFactory ThreadPoolExecutor TimeUnit)
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

(defn- outcome
  "Call `f`, returning `{:value v}` or `{:thrown e}`, with the time it took in `:ms`."
  [f]
  (let [timer (u/start-timer)]
    (try
      (let [v (f)]
        {:value v, :ms (u/since-ms timer)})
      (catch Throwable e
        {:thrown e, :ms (u/since-ms timer)}))))

(defn- error-type
  "The kind of failure, without its message: the Python error name both parsers report (`ParseError`, ...), or the
  exception class when there is none."
  [^Throwable e]
  (or (:sql-parsing/python-error-type (ex-data e))
      (.getName (class e))))

(def ^:private sql-token
  "One token of generated SQL: a quoted string or identifier, a comment, a word, or one other character."
  #"(?s)'(?:[^'\\]|\\.|'')*'|\"(?:[^\"]|\"\")*\"|`(?:[^`]|``)*`|/\*.*?\*/|--[^\n]*|[\p{L}\p{N}_$@#]+|\S")

(defn- sql-tokens
  "`sql` as its tokens, so that layout does not count (`JOIN b\\n  ON` and `JOIN b ON`, `( a )` and `(a)`) and the
  contents of literals, quoted identifiers and comments do."
  [sql]
  (some->> sql (re-seq sql-token) (mapv str/trim)))

(defn- sets-of-used-fields
  "`field-references` output with every `:used-fields` as a set: the parsers find the same fields in different orders,
  and order carries no meaning."
  [value]
  (walk/postwalk (fn [x]
                   (cond-> x
                     (and (map? x) (contains? x :used-fields)) (update :used-fields set)))
                 value))

(defn logical-value
  "What callers get from `method`'s `value`, without what carries no meaning for them: order where order is not
  meaningful, the layout of SQL, and the wording of messages."
  [method value]
  (case method
    (:referenced-tables
     :referenced-fields)      (set value)
    :returned-columns-lineage (mapv (fn [[alias pure? deps]] [alias pure? (set deps)]) value)
    :validate-query           (select-keys value [:status :type :column :table])
    :simple-query             (select-keys value [:is_simple])
    (:add-into-clause
     :replace-names)          (sql-tokens value)
    :field-references         (sets-of-used-fields (results/field-references value))
    :single-stmt-of-type      (update value :sql sql-tokens)
    :transpile-sql            (if (= "success" (:status value))
                                (update value :transpiled_sql sql-tokens)
                                (select-keys value [:status :reason]))))

(defn classify
  "Compare the `primary` and `shadow` [[outcome]]s of `method`. Returns `:match`, `:mismatch` (different
  [[logical-value]]s), `:error-type-mismatch` (both failed, differently), `:primary-only-error` or
  `:shadow-only-error`."
  [method primary shadow]
  (let [primary-failed? (contains? primary :thrown)
        shadow-failed?  (contains? shadow :thrown)]
    (cond
      (and primary-failed? shadow-failed?) (if (= (error-type (:thrown primary)) (error-type (:thrown shadow)))
                                             :match
                                             :error-type-mismatch)
      primary-failed?                      :primary-only-error
      shadow-failed?                       :shadow-only-error
      (= (logical-value method (:value primary))
         (logical-value method (:value shadow)))  :match
      :else                                :mismatch)))

(defn- record-comparison!
  [method dialect result]
  (analytics/inc! :metabase-sql-parsing/shadow-comparisons
                  {:method (name method), :dialect (or dialect "default"), :outcome (name result)}))

(defn- record-duration!
  [backend method ms]
  (analytics/observe! :metabase-sql-parsing/shadow-duration-ms
                      {:parser (name backend), :method (name method)}
                      ms))

(defn- record-in-flight!
  "Set the gauge of comparisons running or waiting to the count in `in-flight`. A shadow parse that never returns
  keeps it above zero. Reading and writing under one lock means the last write carries the current count."
  [backend ^AtomicLong in-flight]
  (locking in-flight
    (analytics/set-gauge! :metabase-sql-parsing/shadow-in-flight {:parser (name backend)} (.get in-flight))))

(def ^:private difference-log-interval-ms
  "At most one difference log line per method in this many milliseconds; Prometheus has every count."
  60000)

(defn- difference-message
  [result method dialect primary-backend shadow-backend caller-thread]
  (format "SQL parsing shadow: %s on %s (%s) between %s and %s, caller thread %s"
          (name result) (name method) (or dialect "default") (name primary-backend) (name shadow-backend)
          caller-thread))

(defn- quietly
  "Call `f`, ignoring any exception: a metric that cannot be written must not change what the caller sees."
  [f]
  (try
    (f)
    (catch Throwable e
      (log/debugf "Could not record a shadow parser metric: %s" (.getName (class e))))))

(defn- executor
  "Two threads and at most 64 waiting comparisons. When all are taken the comparison is dropped, so a slow or stuck
  shadow parser costs at most two threads and never delays a caller."
  ^ThreadPoolExecutor []
  (let [n (atom 0)]
    (doto (ThreadPoolExecutor. 2 2 60 TimeUnit/SECONDS (ArrayBlockingQueue. 64)
                               (reify ThreadFactory
                                 (newThread [_ runnable]
                                   (doto (Thread. runnable (str "sql-parsing-shadow-" (swap! n inc)))
                                     (.setDaemon true)))))
      (.allowCoreThreadTimeOut true))))

(defn parser
  "A SqlParser that answers with `primary` and, when `(sample? method)` is true, runs `shadow` on the same arguments
  in the background and compares the two. Each comparison counts one `metabase-sql-parsing/shadow-comparisons`
  outcome (see [[classify]]); one that finds no room in the background queue counts as `dropped`, and one that
  throws as `comparison-failed`. The gauge `metabase-sql-parsing/shadow-in-flight` counts the comparisons running
  or waiting. A comparison that is not a match also logs one INFO line (see [[difference-message]]), at most one per
  method a minute, through `log-difference!` (default: `log/info`). The backend keywords label the metrics. A
  `sample?` that throws means no comparison.

  Each call makes a thread pool, so callers keep the parser for the life of the process."
  [{:keys [primary-backend primary shadow-backend shadow sample? log-difference!]
    :or   {log-difference! #(log/info %)}}]
  (let [executor  (executor)
        in-flight (AtomicLong.)
        last-logged (atom {})
        ;; true for at most one caller per method per interval: the one whose swap records the time
        log-due?  (fn [method]
                    (let [now             (System/currentTimeMillis)
                          [before after] (swap-vals! last-logged
                                                     (fn [logged]
                                                       (cond-> logged
                                                         (<= difference-log-interval-ms (- now (get logged method 0)))
                                                         (assoc method now))))]
                      (not= before after)))
        sampled?  (fn [method]
                    (try
                      (boolean (sample? method))
                      (catch Throwable e
                        (log/debugf "Could not decide whether to sample a shadow comparison: %s" (.getName (class e)))
                        false)))
        compare!  (fn [method dialect call primary-outcome caller-thread]
                    (try
                      (record-duration! primary-backend method (:ms primary-outcome))
                      (let [shadow-outcome (outcome #(call shadow))
                            result         (classify method primary-outcome shadow-outcome)]
                        (record-duration! shadow-backend method (:ms shadow-outcome))
                        (when (and (not= :match result) (log-due? method))
                          (quietly #(log-difference! (difference-message result method dialect primary-backend
                                                                         shadow-backend caller-thread))))
                        (record-comparison! method dialect result))
                      (catch Throwable e
                        (quietly #(record-comparison! method dialect :comparison-failed))
                        (log/warnf "Could not compare the %s SQL parsers on %s: %s"
                                   (name shadow-backend) (name method) (.getName (class e))))
                      (finally
                        (.decrementAndGet in-flight)
                        (quietly #(record-in-flight! shadow-backend in-flight)))))
        run       (fn [method dialect call]
                    (let [primary-outcome (outcome #(call primary))]
                      (when (sampled? method)
                        (.incrementAndGet in-flight)
                        (try
                          (let [caller-thread (.getName (Thread/currentThread))]
                            (.execute executor ^Runnable #(compare! method dialect call primary-outcome caller-thread)))
                          (catch RejectedExecutionException _
                            (.decrementAndGet in-flight)
                            (quietly #(record-comparison! method dialect :dropped))))
                        (quietly #(record-in-flight! shadow-backend in-flight)))
                      (if-let [e (:thrown primary-outcome)]
                        (throw ^Throwable e)
                        (:value primary-outcome))))]
    (reify protocol/SqlParser
      (referenced-tables [_ dialect sql]
        (run :referenced-tables dialect #(protocol/referenced-tables % dialect sql)))
      (referenced-fields [_ dialect sql]
        (run :referenced-fields dialect #(protocol/referenced-fields % dialect sql)))
      (returned-columns-lineage [_ dialect sql default-table-schema sqlglot-schema]
        (run :returned-columns-lineage dialect
             #(protocol/returned-columns-lineage % dialect sql default-table-schema sqlglot-schema)))
      (validate-query [_ dialect sql default-table-schema sqlglot-schema]
        (run :validate-query dialect #(protocol/validate-query % dialect sql default-table-schema sqlglot-schema)))
      (simple-query [_ dialect sql]
        (run :simple-query dialect #(protocol/simple-query % dialect sql)))
      (add-into-clause [_ dialect sql table-name]
        (run :add-into-clause dialect #(protocol/add-into-clause % dialect sql table-name)))
      (field-references [_ dialect sql]
        (run :field-references dialect #(protocol/field-references % dialect sql)))
      (replace-names [_ dialect sql replacements]
        (run :replace-names dialect #(protocol/replace-names % dialect sql replacements)))
      (single-stmt-of-type [_ dialect sql stmt-type]
        (run :single-stmt-of-type dialect #(protocol/single-stmt-of-type % dialect sql stmt-type)))
      (transpile-sql [_ sql from-dialect to-dialect]
        (run :transpile-sql from-dialect #(protocol/transpile-sql % sql from-dialect to-dialect))))))
