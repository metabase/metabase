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
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(def ^:private marker :auto/param)

(defn- marker-form?
  [x]
  (and (sequential? x)
       (= marker (first x))
       (= 2 (count x))))

(defn auto-param
  "Rewrite `[:auto/param v]` markers in `query` into HoneySQL's `[:param :kN]`, returning
  `[rewritten-query params-map]`.

  Does not descend into a marker's payload: whatever a caller marked is the value, even when that
  value is itself shaped like a marker.

  Keys are gensymed rather than sequential so that a `[:param :k]` arriving from request data
  cannot name a slot this query minted."
  [query]
  (let [params (volatile! {})
        lift   (fn [x]
                 (if (marker-form? x)
                   (let [k (keyword (str "p" (Long/toUnsignedString (.nextLong (java.util.Random.)) 36)))]
                     (vswap! params assoc k (second x))
                     [:param k])
                   x))
        walked (walk/prewalk
                (fn [x]
                  (if (marker-form? x)
                    ;; Replace the whole form without recursing into its payload.
                    (lift x)
                    x))
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
        ;; HoneySQL takes params as a format option rather than a query clause. Merge rather than
        ;; replace, so a nested compile does not drop an enclosing one's params.
        (binding [t2.honeysql/*options* (update (t2.honeysql/options) :params merge params)]
          (next-method query-type model query))
        (next-method query-type model query)))))
