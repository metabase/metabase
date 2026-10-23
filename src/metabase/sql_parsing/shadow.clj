(ns metabase.sql-parsing.shadow
  "A [[metabase.sql-parsing.protocol/SqlParser]] that answers with one parser and runs a second on the same input in
  the background, to measure how often they agree before the second one is trusted with answers.

  The caller gets the primary parser's value, or its exception, unchanged, and never waits for the shadow parser. The
  comparison produces Prometheus counts only. Nothing here logs SQL or a parser's error message, since both can hold
  customer SQL."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.analytics-interface.core :as analytics]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ArrayBlockingQueue RejectedExecutionException ThreadFactory ThreadPoolExecutor TimeUnit)))

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

(defn- sets-of-used-fields
  "`field-references` output with every `used_fields` list as a set: the parsers find the same fields, in different
  orders, and [[metabase.sql-parsing.core/field-references]] makes the top-level list a set anyway."
  [value]
  (walk/postwalk (fn [x]
                   (cond-> x
                     (and (map? x) (contains? x :used_fields)) (update :used_fields set)))
                 value))

(defn- normalize
  "`value` with the differences that do not change what callers do taken out."
  [method value]
  (case method
    :field-references         (-> (sets-of-used-fields value)
                                  (update :errors set))
    ;; the order of a column's dependencies carries no meaning
    :returned-columns-lineage (mapv (fn [[alias pure? deps]] [alias pure? (set deps)]) value)
    ;; the generators lay out the same SQL differently, e.g. `JOIN b\n  ON` and `JOIN b ON`
    :transpile-sql            (update value :transpiled_sql #(some-> % (str/replace #"\s+" " ")))
    value))

(defn classify
  "Compare the `primary` and `shadow` [[outcome]]s of `method`. Returns `:match`, `:mismatch` (different values),
  `:error-type-mismatch` (both failed, differently), `:primary-only-error` or `:shadow-only-error`."
  [method primary shadow]
  (let [primary-failed? (contains? primary :thrown)
        shadow-failed?  (contains? shadow :thrown)]
    (cond
      (and primary-failed? shadow-failed?) (if (= (error-type (:thrown primary)) (error-type (:thrown shadow)))
                                             :match
                                             :error-type-mismatch)
      primary-failed?                      :primary-only-error
      shadow-failed?                       :shadow-only-error
      (= (normalize method (:value primary))
         (normalize method (:value shadow)))  :match
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

(defn- executor
  "At most two threads and 64 waiting comparisons. When both are full the comparison is dropped, so a slow or stuck
  shadow parser costs at most two threads and never delays a caller."
  ^ThreadPoolExecutor []
  (let [n (atom 0)]
    (doto (ThreadPoolExecutor. 1 2 60 TimeUnit/SECONDS (ArrayBlockingQueue. 64)
                               (reify ThreadFactory
                                 (newThread [_ runnable]
                                   (doto (Thread. runnable (str "sql-parsing-shadow-" (swap! n inc)))
                                     (.setDaemon true)))))
      (.allowCoreThreadTimeOut true))))

(defn parser
  "A SqlParser that answers with `primary` and, when `(sample? method)` is true, runs `shadow` on the same arguments
  in the background and compares the two. Each comparison counts one `metabase-sql-parsing/shadow-comparisons`
  outcome (see [[classify]]); one that finds no room in the background queue counts as `dropped`, and one that
  throws as `comparison-failed`. The backend keywords label the duration metric.

  Each call makes a thread pool, so callers keep the parser for the life of the process."
  [{:keys [primary-backend primary shadow-backend shadow sample?]}]
  (let [executor (executor)
        compare! (fn [method dialect call primary-outcome]
                   (try
                     (let [shadow-outcome (outcome #(call shadow))]
                       (record-duration! shadow-backend method (:ms shadow-outcome))
                       (record-comparison! method dialect (classify method primary-outcome shadow-outcome)))
                     (catch Throwable e
                       (record-comparison! method dialect :comparison-failed)
                       (log/warnf "Could not compare the %s SQL parsers on %s: %s"
                                  (name shadow-backend) (name method) (.getName (class e))))))
        run      (fn [method dialect call]
                   (let [primary-outcome (outcome #(call primary))]
                     (when (sample? method)
                       (record-duration! primary-backend method (:ms primary-outcome))
                       (try
                         (.execute executor ^Runnable #(compare! method dialect call primary-outcome))
                         (catch RejectedExecutionException _
                           (record-comparison! method dialect :dropped))))
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
