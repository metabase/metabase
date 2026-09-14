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
  "Whether `x` is a `[:auto/param v]` marker.

  A `MapEntry` is also a two-element vector, so the entry `{:auto/param v}` would otherwise look
  like a marker and the map holding it would be rewritten away."
  [x]
  (and (vector? x)
       (not (instance? MapEntry x))
       (= :auto/param (first x))))

(defn- check-arity!
  "A marker-headed vector that is not `[:auto/param v]` is always a mistake: HoneySQL does not know
  the marker and compiles the leftover form into a call to a function named PARAM, which fails at
  the database with nothing pointing back here."
  [x]
  (when-not (= 2 (count x))
    (throw (ex-info (str "[:auto/param ...] takes exactly one value, got " (dec (count x)) ": " (pr-str x))
                    {:type ::malformed-marker, :form x}))))

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
                      (check-arity! x)
                      (let [k (param-key)]
                        (vswap! params assoc k (second x))
                        [:param k]))))
                query)]
    [walked @params]))

(methodical/defmethod t2.pipeline/compile :around :default
  [query-type model built-query]
  ;; Toucan re-enters `compile` with the `[sql & args]` vector it produced, so only a map is worth
  ;; walking -- and skipping the rest keeps this off the second pass.
  (if-not (map? built-query)
    (next-method query-type model built-query)
    (let [[query params] (auto-param built-query)]
      (if (seq params)
        ;; HoneySQL takes params as a format option rather than a query clause. Merge so that an
        ;; enclosing `*options*` keeps whatever params it already carried.
        (binding [t2.honeysql/*options* (update (t2.honeysql/options) :params merge params)]
          (next-method query-type model query))
        (next-method query-type model query)))))
