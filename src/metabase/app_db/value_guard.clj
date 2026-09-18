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

(def ^:private identifier-clauses
  "Query-map keys whose entries name columns or tables rather than carrying values."
  ;; `:order-by` and `:group-by` are deliberately absent: HoneySQL binds a param in both
  ;; (`ORDER BY ?`), so a marker there is a pointless no-op rather than a dropped value, and
  ;; refusing it would turn a harmless mistake into a production exception.
  #{:select :select-distinct :select-top :from :join :left-join :right-join :inner-join :full-join
    :cross-join :update :insert-into :delete-from :returning :with :with-columns :using
    :create-table :drop-table :truncate :partition-by :window})

(def ^:private on-condition-clauses
  "Join clauses that alternate a table with an ON condition, so odd positions hold values."
  ;; `:cross-join` is NOT one of these -- it takes a flat list of tables with no condition, so
  ;; every element is an identifier.
  #{:join :left-join :right-join :inner-join :full-join})

(def ^:private expression-entry-clauses
  "Identifier clauses where index 0 of an `[expr alias]` entry is an expression, so HoneySQL binds a
  param there."
  ;; Each of these formats `[[:param :k] :a]` as `? AS a` or `? a`. The table clauses bind it too --
  ;; `FROM ? AS a` -- but a table cannot be a parameter, so the database rejects the statement, and
  ;; refusing it here names the mistake instead. `:with` throws inside HoneySQL, and the DDL clauses
  ;; format it as an identifier or inline the value.
  #{:select :select-distinct :select-top :returning :partition-by})

(declare marker-in-identifier-position?)

(defn- marker-in-entry?
  "Whether a marker sits in an identifier position of `entry`, one element of identifier `clause`.

  An entry is `expr`, or `[expr alias]`. HoneySQL tells those apart POSITIONALLY, not by shape, so
  only index 0 may be an expression -- everything after it is an alias, which is always an
  identifier. Checking by head shape instead let `[:t [:auto/param \"al\"]]` pass as though `:t`
  headed an operator form, and the value was silently compiled to the identifier `param`.

  A marker directly at index 0 is bound, not dropped, in a clause in [[expression-entry-clauses]], so
  it does not count there."
  [clause entry]
  (cond
    ;; The entry IS a marker -- `:select [[:auto/param "n"]]`. Destructuring it below would read
    ;; `:auto/param` as the expression, so catch it before that.
    (marker-form? entry)     true
    (not (sequential? entry)) (marker-in-identifier-position? entry)
    :else
    (let [[expr & aliases] entry]
      (boolean (or (and (not (and (marker-form? expr)
                                  (contains? expression-entry-clauses clause)))
                        (marker-in-identifier-position? expr))
                   ;; An alias slot can only be a name. A marker anywhere in one is a mistake.
                   ;; A nested query map is not an alias -- `:with` pairs a name with a query --
                   ;; so those are scanned separately by [[query-maps]].
                   (some #(and (not (map? %)) (contains-marker? %)) aliases))))))

(defn- marker-in-identifier-position?
  "Whether a marker sits in an identifier slot within `form`.

  Descends past two things, which are not mistakes:

  - a keyword-headed operator form, whose arguments are values. A computed projection --
    `[[:= :engine [:auto/param \"h2\"]] :is_match]` -- puts a real comparison in a clause that
    otherwise holds identifiers.
  - a nested query map. A subquery has its own clauses, and [[check-marker-placement]] scans it
    separately, so a marker in its `:where` is judged there rather than here."
  [form]
  (cond
    (map? form)           false
    (marker-form? form)   true
    (operator-form? form) false
    (sequential? form)    (boolean (some marker-in-identifier-position? form))
    :else                 false))

(defn- query-maps
  "`query` and every map nested anywhere inside it.

  A subquery's clauses have to be scanned on their own terms: `:select` in an outer query holds
  identifiers, but a subquery sitting there has its own `:where` that holds values -- and its own
  `:select`, which holds identifiers again."
  [query]
  (let [found (volatile! [])]
    (walk/postwalk (fn [x] (when (map? x) (vswap! found conj x)) x) query)
    @found))

(defn- misplaced-marker
  "The offending entry of `clause`, if `v` puts a marker in an identifier position, else nil."
  [clause v]
  (let [entries (cond
                  ;; Alternating table / ON condition -- only the table halves are identifiers.
                  (and (contains? on-condition-clauses clause) (sequential? v))
                  (take-nth 2 v)

                  ;; Every other identifier clause holds a flat list of entries -- including
                  ;; `:cross-join`, which takes tables with no ON condition.
                  (sequential? v) v

                  ;; A bare value is its own single entry -- `:update :some_table`.
                  :else [v])]
    (first (filter #(marker-in-entry? clause %) entries))))

(defn- check-marker-placement
  "Refuse a marker sitting in a clause that names columns or tables, in `query` or any subquery."
  [query]
  ;; `contains-marker?` first: the overwhelming majority of app-DB queries carry no marker at all,
  ;; and this runs on every one of them at compile.
  (when (contains-marker? query)
    (doseq [m          (query-maps query)
            [clause v] m
            :when      (contains? identifier-clauses clause)
            :let       [part (misplaced-marker clause v)]
            :when      part]
      (throw (ex-info (str "[:auto/param ...] in a " clause " clause: " (pr-str part)
                           ". That slot names a column or table, so the marker would compile to the"
                           " identifier `param` and the value would be dropped. A marker belongs in"
                           " a value slot.")
                      {:type ::marker-outside-value-slot, :clause clause, :form part
                       :query query})))))

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
                        (when (and (coll? v) (empty? v) (not (map? v)))
                          ;; Toucan rewrites `[:in col []]` to `false`, because `IN ()` is invalid
                          ;; SQL, and that rewrite runs inside the compile step this wraps -- so a
                          ;; lifted empty collection would hide it and leave `IN ()`, which Postgres
                          ;; rejects and H2 quietly accepts. Whether the rewrite applies depends on
                          ;; the enclosing operator, which is not visible here, so refuse rather
                          ;; than guess.
                          (throw (ex-info (str "Marked an empty collection: " (pr-str x)
                                               ". Leave it unmarked -- an empty collection is not a"
                                               " value that needs binding, and Toucan rewrites an"
                                               " empty `:in` that it can see.")
                                          {:type ::marked-empty-collection, :form x})))
                        (if (nil? v)
                          ;; HoneySQL turns a literal nil in a comparison into `IS NULL`, where a
                          ;; bound parameter would get `= ?` and match nothing. Leave it to HoneySQL.
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
    (let [_              (check-marker-placement built-query)
          [query params] (auto-param built-query)]
      (assert-no-marker-survived! query)
      (if-not (seq params)
        (next-method query-type model query)
        ;; HoneySQL takes params as a format option rather than a query clause. Merge so that an
        ;; enclosing `*options*` keeps whatever params it already carried.
        (binding [t2.honeysql/*options* (update (t2.honeysql/options) :params merge params)]
          (next-method query-type model query))))))
