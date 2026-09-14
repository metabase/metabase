(ns metabase.app-db.value-guard
  "Binds a value written inline in an app-DB query as a SQL parameter.

  HoneySQL resolves a map in a value slot toward SQL *structure* rather than data, so a value that
  arrives from a request can reach the database as syntax. Marking it keeps it data:

    (t2/select :model/ContentTranslation
               {:where [:= :locale [:auto/param locale]]})
    ;; => [\"SELECT ... WHERE locale = ?\" \"de\"]

  HoneySQL binds a value through `[:param :k]` against a separate params map. `auto-param` rewrites
  the inline marker into that pair at the compile step, so a caller writes the value where it
  belongs and never keeps the two in sync."
  (:require
   [clojure.walk :as walk]
   [methodical.core :as methodical]
   [toucan2.honeysql2 :as t2.honeysql]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (clojure.lang MapEntry)
   (java.util.concurrent ThreadLocalRandom)))

(set! *warn-on-reflection* true)

(defn- marker-form?
  "Whether `x` is marker-shaped -- headed by `:auto/param`.

  Broader than what [[auto-param]] will lift, so that a marker written some other way is rejected
  rather than left to compile. A `MapEntry` is excluded: it is a two-element vector holding its own
  key, so `{:auto/param v}` (a column of that name) would otherwise look like a marker."
  [x]
  (and (sequential? x)
       (not (instance? MapEntry x))
       (= :auto/param (first x))))

(defn- well-formed-marker?
  "Whether `x` is a `[:auto/param v]` marker written the one supported way."
  [x]
  (and (marker-form? x)
       (vector? x)
       (= 2 (count x))))

(defn- check-well-formed!
  "A marker-shaped form that is not `[:auto/param v]` is always a mistake. HoneySQL does not know the
  marker, so whatever is left compiles into a call to a function named PARAM and fails at the
  database with nothing pointing back here."
  [x]
  (when-not (well-formed-marker? x)
    (throw (ex-info (str "Malformed [:auto/param ...] marker: " (pr-str x)
                         ". Write it as a two-element vector, [:auto/param value].")
                    {:type ::malformed-marker, :form x}))))

(defn- contains-marker?
  "Whether any marker survives in `form`."
  [form]
  (let [found (volatile! false)]
    (walk/postwalk (fn [x] (when (marker-form? x) (vreset! found true)) x) form)
    @found))

(defn- param-key
  "A random key for a lifted value. Random rather than sequential so that a `[:param :k]` arriving
  in request data cannot name a slot this query minted."
  []
  (keyword (str "p" (Long/toUnsignedString (.nextLong (ThreadLocalRandom/current)) 36))))

(defn- auto-param
  "Rewrite `[:auto/param v]` markers in `query` into HoneySQL's `[:param :kN]`, returning
  `[rewritten-query params-map]`.

  Does not descend into a marker's payload: whatever a caller marked is the value, even when that
  value is itself shaped like a marker.

  Keys are gensymed rather than sequential so that a `[:param :k]` arriving from request data
  cannot name a slot this query minted."
  [query]
  (let [params (volatile! {})
        walked (walk/prewalk
                (fn [x]
                  (if-not (marker-form? x)
                    x
                    ;; Replace the whole form, so the payload is never descended into.
                    (do
                      (check-well-formed! x)
                      (let [v (second x)]
                        (if (nil? v)
                          ;; HoneySQL turns a literal nil in a comparison into `IS NULL`; a bound
                          ;; parameter gets `= ?`, which no row satisfies. Leave nil to HoneySQL.
                          nil
                          (let [k (param-key)]
                            (vswap! params assoc k v)
                            [:param k]))))))
                query)]
    [walked @params]))

(defn- assert-no-marker-survived!
  "A marker must never reach SQL. HoneySQL does not recognise it and compiles the leftover form into
  a call to a function named PARAM, or -- in a slot it formats as an identifier -- into the literal
  identifier `param`, silently discarding the value."
  [query]
  (when (contains-marker? query)
    (throw (ex-info "[:auto/param ...] would reach SQL unlifted. It belongs in a value slot of a query map."
                    {:type ::marker-reached-sql, :query query}))))

(defn- assert-every-value-bound!
  "Every value lifted out of the query has to come back as a bound argument. A marker sitting in a
  slot HoneySQL formats as an identifier is rewritten but never consumed, which drops the value and
  leaks the generated key into the SQL text.

  Checks that each lifted value is present among the arguments rather than counting them: a query
  carrying unmarked literals has arguments to spare, and a count would let those stand in for a
  value that was dropped."
  [params [sql & args]]
  (let [present (set args)]
    (doseq [v (vals params)
            ;; A sequential value is spread across one argument per element, so the collection
            ;; itself is never an argument -- look for its elements instead. Anything else,
            ;; including a map, binds whole.
            :let [bound? (if (sequential? v)
                           (every? present v)
                           (contains? present v))]
            :when (not bound?)]
      (throw (ex-info (str "[:auto/param ...] did not bind: " (pr-str v)
                           " was marked as a value but is not among the query's parameters."
                           " A marker belongs in a value slot, not a column or table position.")
                      {:type ::marker-not-bound, :value v, :sql sql})))))

(methodical/defmethod t2.pipeline/compile :around :default
  [query-type model built-query]
  ;; Toucan re-enters `compile` with the `[sql & args]` vector it produced, so only a map is worth
  ;; walking -- and skipping the rest keeps this off the second pass.
  (if-not (map? built-query)
    (do (assert-no-marker-survived! built-query)
        (next-method query-type model built-query))
    (let [[query params] (auto-param built-query)]
      (assert-no-marker-survived! query)
      (if-not (seq params)
        (next-method query-type model query)
        ;; HoneySQL takes params as a format option rather than a query clause. Merge so that an
        ;; enclosing `*options*` keeps whatever params it already carried.
        (let [sql-args (binding [t2.honeysql/*options* (update (t2.honeysql/options) :params merge params)]
                         (next-method query-type model query))]
          (assert-every-value-bound! params sql-args)
          sql-args)))))
