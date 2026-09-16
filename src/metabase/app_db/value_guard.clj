(ns metabase.app-db.value-guard
  "Binds a value written inline in an app-DB query as a SQL parameter.

  HoneySQL resolves a map in a value slot toward SQL *structure* rather than data, so a value that
  arrives from a request can reach the database as syntax. Marking it keeps it data:

    (t2/select :model/ContentTranslation
               {:where [:= :locale [:auto/param locale]]})
    ;; => [\"SELECT ... WHERE locale = ?\" \"de\"]

  HoneySQL binds a value through `[:param :k]` against a separate params map. `auto-param` rewrites
  the inline marker into that pair at the compile step, so a caller writes the value where it
  belongs and never keeps the two in sync.

  A marker is not what stops a hostile non-scalar. `honeysql-guard` runs `:before` this `:around`,
  so it sees the payload still inline and rejects a `{:raw ...}` or a bare subquery there whether or
  not it was marked. What the marker adds is that an ordinary value -- a string, a locale, a token --
  is bound rather than left for HoneySQL to interpret.

  Put a marker in a value slot. Written anywhere else it is rewritten into a `[:param :k]` that
  HoneySQL formats as an identifier rather than binding, so the value is dropped and the generated
  key lands in the statement:

    {:from [[:auto/param \"core_user\"]]}   ;; => [\"SELECT * FROM param AS p33yf8xpiqaxw\"]

  Nothing here catches that: HoneySQL gives no signal for a param it did not consume, and which
  positions bind is a decision it makes per operator, so it cannot be inferred from the query."
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
  "Whether `x` is a marker this can lift.

  Two shapes reach here. `[:auto/param v]` is what a caller writes in a query map. Toucan builds a
  kv-arg -- `(t2/select :model/X :locale [:auto/param v])` -- into `[:auto/param :locale v]`, taking
  the marker keyword for the operator and folding the column in, so that arity is a marked kv-arg
  rather than a mistake."
  [x]
  (and (marker-form? x)
       (vector? x)
       (contains? #{2 3} (count x))))

(defn- operator-form?
  "Whether `v` looks like a HoneySQL operator form -- `[:in [...]]`, `[:not-between lo hi]`.

  Any keyword heads an operator as far as Toucan is concerned, so this asks whether the payload is
  keyword-headed rather than checking against a list of known operators. Listing them would let an
  unlisted one through to be bound as a value, which changes the comparison rather than failing."
  [v]
  (and (sequential? v)
       (keyword? (first v))
       (not= :auto/param (first v))))

(defn- kv-arg-marker?
  "Whether `x` is the `[:auto/param column v]` form Toucan builds from a marked kv-arg."
  [x]
  (and (well-formed-marker? x)
       (= 3 (count x))))

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
  value is itself shaped like a marker."
  [query]
  (let [params (volatile! {})
        walked (walk/prewalk
                (fn [x]
                  (if-not (marker-form? x)
                    x
                    ;; Replace the whole form, so the payload is never descended into.
                    (do
                      (check-well-formed! x)
                      (let [kv? (kv-arg-marker? x)
                            v   (if kv? (nth x 2) (second x))
                            _   (when (operator-form? v)
                                  ;; Binding an operator form would make it the value of a
                                  ;; comparison rather than the comparison itself, turning
                                  ;; `IN (?, ?)` into `= ?` against a list. The marker goes inside.
                                  (throw (ex-info (str "Marked a whole operator form: " (pr-str x)
                                                       ". Put the marker on the value instead, e.g. "
                                                       "[" (first v) " [:auto/param ...]].")
                                                  {:type ::marked-operator-form, :form x})))
                            ;; A marked kv-arg has to come back out as a comparison, since Toucan
                            ;; folded the column into the marker rather than building one.
                            wrap (if kv? #(vector := (second x) %) identity)]
                        (if (or (nil? v)
                                (and (coll? v) (empty? v)))
                          ;; Some literals are rewritten downstream by something that has to see
                          ;; them. HoneySQL turns a literal nil in a comparison into `IS NULL`,
                          ;; where a bound parameter would get `= ?` and match nothing; Toucan
                          ;; rewrites `[:in col []]` to `false`, where a bound parameter would
                          ;; leave `IN ()` -- invalid on Postgres, and quietly accepted by H2.
                          ;; Lifting hides the literal from those rewrites, so leave it in place.
                          (wrap v)
                          (let [k (param-key)]
                            (vswap! params assoc k v)
                            (wrap [:param k])))))))
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
        (binding [t2.honeysql/*options* (update (t2.honeysql/options) :params merge params)]
          (next-method query-type model query))))))
