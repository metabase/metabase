(ns metabase-enterprise.library-branching.format.kinds.portable
  "MBQL 5 in its portable JSON form: databases, tables and fields by natural key, cards, snippets, segments and
  measures by entity id, and keyword values as strings. The references of a portable value, and the `:lib/type` keys
  of a query that its structure implies.")

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- References ---------------------------------------------------

;; This namespace walks the portable form by its structure, as `serdes/mbql-deps` does: no function of metabase.lib
;; reads it, because lib needs database ids and a metadata provider.

(def ^:private item-keys
  "Map keys whose string value is the entity id of an item, with the role of the reference."
  {:source-card :source-card
   :card-id     :card
   :card_id     :card
   :snippet-id  :snippet})

(def ^:private env-keys
  "Map keys whose vector value is the natural key of an environment object, with the role of the reference."
  {:source-table :source-table
   :source-field :field
   :field-id     :field
   :table-id     :table})

(def ^:private item-clauses
  "Clause tags whose third element is the entity id of an item, with the role of the reference."
  {"metric" :metric, "segment" :segment, "measure" :measure})

(defn key-refs
  "The reference that the map entry `k` `v` is, or nil."
  [k v]
  (cond
    (and (contains? item-keys k) (string? v)) [(get item-keys k) v]
    (and (contains? env-keys k) (vector? v))  [(get env-keys k) [:env v]]))

(defn clause-ref
  "The reference that the clause `x` (a vector) names itself, or nil: a field clause by its natural key (the MBQL 5
  form `[\"field\" opts key]` and the legacy form `[\"field\" key opts]`), or a metric, segment or measure clause."
  [[tag a b :as x]]
  (when (= 3 (count x))
    (cond
      (and (= "field" tag) (map? a) (vector? b))            [:field [:env b]]
      (and (= "field" tag) (vector? a))                     [:field [:env a]]
      (and (contains? item-clauses tag) (map? a) (some? b)) [(get item-clauses tag) b])))

(defn refs
  "The set of references `[role target]` in the portable value `x`, at any depth. A reference position holds its value
  as the target whatever its shape, so an item schema refuses a target that is not an identity."
  [x]
  (letfn [(walk [acc x]
            (cond
              (map? x)    (reduce-kv (fn [acc k v]
                                       (if-let [r (key-refs k v)]
                                         (conj acc r)
                                         (walk acc v)))
                                     acc
                                     x)
              (vector? x) (let [acc (reduce walk acc x)]
                            (if-let [r (clause-ref x)] (conj acc r) acc))
              :else       acc))]
    (walk #{} x)))

(defn query-refs
  "The references of the portable query `query`: [[refs]], and its database."
  [query]
  (let [db (when (map? query) (:database query))]
    (cond-> (refs query)
      (string? db) (conj [:database [:env [db]]]))))

;;; --------------------------------------------------- Implied keys --------------------------------------------------

(defn implied-stage-type
  "The `:lib/type` that a stage's structure implies: native iff it has `:native`."
  [stage]
  (if (contains? stage :native) "mbql.stage/native" "mbql.stage/mbql"))

(defn- map-stages
  [f m]
  (cond-> m
    (vector? (:stages m)) (update :stages (partial mapv #(if (map? %) (f %) %)))))

(defn- map-joins
  [f stage]
  (cond-> stage
    (vector? (:joins stage)) (update :joins (partial mapv #(if (map? %) (f %) %)))))

(defn omit-implied
  "Portable query `query` without each `:lib/type` that equals the one that its position implies: \"mbql/query\" on
  the query, [[implied-stage-type]] on each stage of the query and of each join, \"mbql/join\" on each join. A value
  that is not a map is returned as it is."
  [query]
  (letfn [(omit [m implied] (cond-> m (= implied (:lib/type m)) (dissoc :lib/type)))
          (omit-stage [stage] (omit (map-joins omit-join stage) (implied-stage-type stage)))
          (omit-join [join] (omit (map-stages omit-stage join) "mbql/join"))]
    (cond-> query
      (map? query) (-> (->> (map-stages omit-stage)) (omit "mbql/query")))))

(defn restore-implied
  "The inverse of [[omit-implied]]: portable query `query` with the implied `:lib/type` added at each position that has
  none."
  [query]
  (letfn [(restore [m implied] (cond-> m (not (contains? m :lib/type)) (assoc :lib/type implied)))
          (restore-stage [stage] (restore (map-joins restore-join stage) (implied-stage-type stage)))
          (restore-join [join] (restore (map-stages restore-stage join) "mbql/join"))]
    (cond-> query
      (map? query) (-> (->> (map-stages restore-stage)) (restore "mbql/query")))))

(defn implied-keys?
  "True iff the portable query `query` has a `:lib/type` at each position that [[omit-implied]] can omit."
  [query]
  (letfn [(stage? [stage] (and (contains? stage :lib/type)
                               (every? join? (when (vector? (:joins stage)) (filter map? (:joins stage))))))
          (join? [join] (and (contains? join :lib/type) (stages? join)))
          (stages? [m] (every? stage? (when (vector? (:stages m)) (filter map? (:stages m)))))]
    (and (map? query) (contains? query :lib/type) (stages? query))))
