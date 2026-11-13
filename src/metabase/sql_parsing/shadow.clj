(ns metabase.sql-parsing.shadow
  "A [[metabase.sql-parsing.protocol/SqlParser]] that answers with one parser and runs a second on the same input in
  the background, to measure how often they agree before the second one is trusted with answers.

  The caller gets the primary parser's value, or its exception, unchanged, and never waits for the shadow parser:
  everything else here, sampling and metrics included, runs on the background thread or cannot throw. The comparison
  produces Prometheus counts, and a log line when the parsers differ that names the method, the dialect and the
  caller's thread, so the logs around it show what was being parsed. Nothing here logs SQL or a parser's error
  message, since both can hold customer SQL. A caller that wants the SQL of each difference gives a
  `record-difference!` function (see [[parser]]).

  The parsers are compared on what callers get from [[metabase.sql-parsing.core]] (the tables, the fields, the
  verdict, the SQL as tokens), not on the raw values a parser returns: two parsers that differ only in shape, layout
  or the wording of a message agree."
  (:require
   [clojure.string :as str]
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
     :add-insert-clause
     :replace-names)          (sql-tokens value)
    :field-references         (results/field-references value)
    :single-stmt-of-type      (-> value (update :sql sql-tokens) (update :error some?))
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
  "Call `f`, ignoring any exception: a metric or a record that cannot be written must not change what the caller
  sees."
  [f]
  (try
    (f)
    (catch Throwable e
      (log/debugf "Could not record a shadow parser comparison: %s" (.getName (class e))))))

(defn- recorded-outcome
  "An [[outcome]] as a difference record keeps it: the value, or the type and message of the error."
  [{:keys [value thrown]}]
  (if thrown
    {:error (error-type thrown), :message (ex-message thrown)}
    {:value value}))

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

(defn- log-due?
  "True for at most one caller for each method in each [[difference-log-interval-ms]]: the one whose swap records the
  time."
  [last-logged method]
  (let [now            (System/currentTimeMillis)
        [before after] (swap-vals! last-logged
                                   (fn [logged]
                                     (cond-> logged
                                       (<= difference-log-interval-ms (- now (get logged method 0)))
                                       (assoc method now))))]
    (not= before after)))

(defn- sampled?
  "Whether to compare this call. A `sample?` that throws means no."
  [sample? method]
  (try
    (boolean (sample? method))
    (catch Throwable e
      (log/debugf "Could not decide whether to sample a shadow comparison: %s" (.getName (class e)))
      false)))

(defn- report-difference!
  "Log the difference `result` at most once a minute for each method, and record it."
  [{:keys [primary-backend shadow-backend last-logged log-difference! record-difference!]}
   {:keys [method dialect sql args caller-thread primary-outcome]}
   result
   shadow-outcome]
  (when (log-due? last-logged method)
    (quietly #(log-difference! (difference-message result method dialect primary-backend shadow-backend
                                                   caller-thread))))
  (quietly #(record-difference! {:method          method
                                 :dialect         dialect
                                 :outcome         result
                                 :primary-backend primary-backend
                                 :shadow-backend  shadow-backend
                                 :sql             sql
                                 :args            args
                                 :primary         (recorded-outcome primary-outcome)
                                 :shadow          (recorded-outcome shadow-outcome)})))

(defn- compare!
  "Run the shadow parser on the call `call-info` and compare its outcome with the primary one. Runs on a background
  thread."
  [{:keys [primary-backend shadow-backend shadow in-flight] :as ctx}
   {:keys [method dialect call primary-outcome] :as call-info}]
  (try
    (record-duration! primary-backend method (:ms primary-outcome))
    (let [shadow-outcome (outcome #(call shadow))
          result         (classify method primary-outcome shadow-outcome)]
      (record-duration! shadow-backend method (:ms shadow-outcome))
      (when (not= :match result)
        (report-difference! ctx call-info result shadow-outcome))
      (record-comparison! method dialect result))
    (catch Throwable e
      (quietly #(record-comparison! method dialect :comparison-failed))
      (log/warnf "Could not compare the %s SQL parsers on %s: %s"
                 (name shadow-backend) (name method) (.getName (class e))))
    (finally
      (.decrementAndGet ^AtomicLong in-flight)
      (quietly #(record-in-flight! shadow-backend in-flight)))))

(defn- schedule-comparison!
  "Queue the comparison of the call `call-info` on the background thread pool, or count it as dropped when the pool
  is full."
  [{:keys [shadow-backend ^ThreadPoolExecutor executor ^AtomicLong in-flight] :as ctx}
   {:keys [method dialect] :as call-info}]
  (.incrementAndGet in-flight)
  (try
    (.execute executor ^Runnable #(compare! ctx call-info))
    (catch RejectedExecutionException _
      (.decrementAndGet in-flight)
      (quietly #(record-comparison! method dialect :dropped))))
  (quietly #(record-in-flight! shadow-backend in-flight)))

(defn- run
  "Call `call` on the primary parser, schedule a comparison when this call is sampled, and return the primary value
  or throw its exception."
  [{:keys [primary sample?] :as ctx} method dialect sql args call]
  (let [primary-outcome (outcome #(call primary))]
    (when (sampled? sample? method)
      (schedule-comparison! ctx {:method          method
                                 :dialect         dialect
                                 :sql             sql
                                 :args            args
                                 :call            call
                                 :primary-outcome primary-outcome
                                 :caller-thread   (.getName (Thread/currentThread))}))
    (if-let [e (:thrown primary-outcome)]
      (throw ^Throwable e)
      (:value primary-outcome))))

(defn parser
  "A SqlParser that answers with `primary` and, when `(sample? method)` is true, runs `shadow` on the same arguments in
  the background and compares the two. Each comparison counts one `metabase-sql-parsing/shadow-comparisons` outcome
  (see [[classify]]); one that finds no room in the background queue counts as `dropped`, and one that throws as
  `comparison-failed`. The gauge `metabase-sql-parsing/shadow-in-flight` counts the comparisons running or waiting.
  A comparison that is not a match also logs one INFO line (see [[difference-message]]), at most one per method a
  minute, through `log-difference!` (default: `log/info`), and calls `record-difference!` (default: do nothing) on the
  background thread. The backend keywords label the metrics. A `sample?` that throws means no comparison.

  Each call makes a thread pool, so callers keep the parser for the life of the process."
  [opts]
  (let [ctx (merge {:log-difference!    #(log/info %)
                    :record-difference! (fn [_])}
                   opts
                   {:executor    (executor)
                    :in-flight   (AtomicLong.)
                    :last-logged (atom {})})]
    (reify protocol/SqlParser
      (referenced-tables [_ dialect sql]
        (run ctx :referenced-tables dialect sql [] #(protocol/referenced-tables % dialect sql)))
      (referenced-fields [_ dialect sql]
        (run ctx :referenced-fields dialect sql [] #(protocol/referenced-fields % dialect sql)))
      (returned-columns-lineage [_ dialect sql default-table-schema sqlglot-schema]
        (run ctx :returned-columns-lineage dialect sql [default-table-schema sqlglot-schema]
             #(protocol/returned-columns-lineage % dialect sql default-table-schema sqlglot-schema)))
      (validate-query [_ dialect sql default-table-schema sqlglot-schema]
        (run ctx :validate-query dialect sql [default-table-schema sqlglot-schema]
             #(protocol/validate-query % dialect sql default-table-schema sqlglot-schema)))
      (simple-query [_ dialect sql]
        (run ctx :simple-query dialect sql [] #(protocol/simple-query % dialect sql)))
      (add-into-clause [_ dialect sql table-name]
        (run ctx :add-into-clause dialect sql [table-name] #(protocol/add-into-clause % dialect sql table-name)))
      (add-insert-clause [_ dialect sql table-name]
        (run ctx :add-insert-clause dialect sql [table-name] #(protocol/add-insert-clause % dialect sql table-name)))
      (field-references [_ dialect sql]
        (run ctx :field-references dialect sql [] #(protocol/field-references % dialect sql)))
      (replace-names [_ dialect sql replacements]
        (run ctx :replace-names dialect sql [replacements] #(protocol/replace-names % dialect sql replacements)))
      (single-stmt-of-type [_ dialect sql stmt-type]
        (run ctx :single-stmt-of-type dialect sql [stmt-type] #(protocol/single-stmt-of-type % dialect sql stmt-type)))
      (transpile-sql [_ sql from-dialect to-dialect]
        (run ctx :transpile-sql from-dialect sql [to-dialect]
             #(protocol/transpile-sql % sql from-dialect to-dialect))))))
