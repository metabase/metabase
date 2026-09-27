(ns metabase.jev.apps.intent.features
  "Decompose a query action into FACETS at several levels of abstraction, so preferences learned on one
  table transfer to a table you've never touched.

  A single action — \"on Orders, filtered created_at by last-week, grouped by category, counted\" — teaches
  us things at different levels of generality:

    table       :table/2          — what you do *on this table* (no transfer)
    field       :field/100        — that you filter *this field* (transfers to any query using it)
    base-type   :filter-base/:type/DateTimeWithLocalTZ
    semantic    :filter-sem/:type/CreationTimestamp
    type-class  :filter-type/temporal   — you like *temporal filters* (transfers to ANY temporal field)
    operator    :filter-op/:time-interval
    aggregation :agg/:count, :agg/:sum
    breakout    :breakout-type/temporal, :breakout-unit/:month

  Each fact is a `[facet value]` pair. [[metabase.jev.apps.intent.store]] counts them independently, so a new
  table has empty `:table/*` and `:field/*` counters but full `:filter-type/*` and `:agg/*` counters —
  and those still predict \"they'll want a temporal filter and a count here.\""
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- field-ref?
  "True for a pMBQL field ref `[:field {opts} id]` (opts-first, id last)."
  [clause]
  (and (vector? clause) (= :field (first clause)) (map? (second clause))))

(defn- field-ref-id
  "The field id from a pMBQL `[:field {opts} id]` ref, or nil for a name/expression ref."
  [clause]
  (when (field-ref? clause)
    (let [id (last clause)] (when (integer? id) id))))

(defn field-type-class
  "Coarse type family of a base type — the level that transfers. One of :temporal :number :text
  :boolean :location, or nil."
  [base-type]
  (cond
    (nil? base-type)                     nil
    (isa? base-type :type/Temporal)      :temporal
    (isa? base-type :type/Number)        :number
    (isa? base-type :type/Boolean)       :boolean
    (isa? base-type :type/Text)          :text
    :else                                :other))

(defn- ref-info
  "`{:base_type … :semantic_type …}` for a pMBQL field ref, read from its INLINE opts first (pMBQL carries
  `:base-type`/`:effective-type`/`:semantic-type` on the ref), falling back to an app-db read only when a
  needed type is missing. Value-free — types only, never the datum."
  [clause]
  (let [opts (when (field-ref? clause) (second clause))
        base (or (:base-type opts) (:effective-type opts))
        sem  (:semantic-type opts)]
    (if (and base sem)
      {:base_type base :semantic_type sem}
      (let [id (field-ref-id clause)
            row (when id (t2/select-one [:model/Field :base_type :semantic_type] :id id))]
        {:base_type (or base (:base_type row)) :semantic_type (or sem (:semantic_type row))}))))

(defn- field-facts
  "Facts about one field ref used in `role` (:filter or :breakout). Returns `[facet value]` pairs across the
  abstraction ladder. Value-free — only ids and types."
  [clause role]
  (let [field-id (field-ref-id clause)
        {:keys [base_type semantic_type]} (ref-info clause)
        rolen (name role)]
    (when field-id
      (cond-> [[(keyword rolen "field") field-id]]
        base_type     (conj [(keyword (str rolen "-type")) (field-type-class base_type)]
                            [(keyword (str rolen "-base")) base_type])
        semantic_type (conj [(keyword (str rolen "-sem")) semantic_type])))))

(def ^:private leaf-filter-op?
  "Operators that head a leaf filter predicate (not the boolean combinators or refs)."
  (complement #{:and :or :not :field :expression :aggregation}))

(defn- filter-shape
  "Classify a leaf filter clause into a value-free *shape* — the generic intent, never the literal.
  Combines the operator with the primary field's type family: e.g. `[:= pk-field 4471]` → `:point-lookup`,
  `[:between date-field _ _]` → `:date-range`. This is what we store: shapes, not values."
  [op field-type-class semantic-type]
  (let [pk-or-fk? (or (isa? semantic-type :type/PK) (isa? semantic-type :type/FK))]
    (cond
      (#{:time-interval :relative-datetime :between} op)
      (if (= :temporal field-type-class) :date-range :range)

      (#{:> :>= :< :<=} op)
      (if (= :temporal field-type-class) :date-threshold :numeric-threshold)

      (#{:contains :starts-with :ends-with :does-not-contain} op)
      :text-search

      (#{:is-null :not-null :is-empty :not-empty} op)
      :presence-check

      (#{:= :!=} op)
      (cond
        pk-or-fk?                    :point-lookup      ; filter by a specific id/key
        (= :temporal field-type-class) :date-exact
        (= :text field-type-class)   :category-select    ; pick a categorical value
        :else                        :equality)

      :else :other-filter)))

(defn- first-field-ref
  "Find the primary field ref within a leaf clause (search its args)."
  [clause]
  (some #(when (field-ref? %) %) (tree-seq vector? seq clause)))

(defn- leaf-filter-facts
  "Facts for one leaf filter predicate (a pMBQL clause `[op {opts} & args]`): its value-free shape + the
  field-level ladder from the ref's inline types."
  [clause]
  (when (and (vector? clause) (keyword? (first clause)) (leaf-filter-op? (first clause)))
    (let [op        (first clause)
          field-ref (first-field-ref clause)
          info      (when field-ref (ref-info field-ref))
          shape     (filter-shape op (field-type-class (:base_type info)) (:semantic_type info))]
      (concat
       [[:filter-shape shape]]
       (when field-ref (field-facts field-ref :filter))))))

(defn- filter-facts [filters]
  ;; pMBQL stage `:filters` is a vector of leaf predicates (top-level implicit AND).
  (->> filters
       (mapcat (fn [clause] (mapcat leaf-filter-facts (tree-seq vector? seq clause))))
       distinct))

(defn- aggregation-facts [aggregation]
  (->> aggregation
       (keep (fn [agg] (when (vector? agg) (first agg))))
       (map (fn [op] [:agg op]))))

(defn- breakout-facts [breakout]
  (mapcat (fn [clause]
            (let [opts (when (field-ref? clause) (second clause))
                  unit (:temporal-unit opts)]
              (cond-> (field-facts clause :breakout)
                unit (conj [:breakout-unit unit]))))
          breakout))

(defn- stage-facts [stage]
  (concat
   (when-let [source-table (:source-table stage)] [[:table source-table]])
   (filter-facts (:filters stage))
   (aggregation-facts (:aggregation stage))
   (breakout-facts (:breakout stage))))

(defn source-table-id
  "The source table id of a pMBQL query (first stage), or nil."
  [query]
  (or (get-in query [:stages 0 :source-table])
      (:source-table query)))

(defn query-facts
  "All value-free `[facet value]` facts for a query. Accepts pMBQL (`{:lib/type :mbql/query :stages [...]}`)
  and iterates every stage. Safe on partial/in-progress queries — missing clauses contribute nothing."
  [query]
  (cond
    (nil? query)               nil
    (:stages query)            (mapcat stage-facts (:stages query))
    ;; a bare stage map (already unwrapped)
    (or (:source-table query)
        (:filters query))      (stage-facts query)
    :else                      nil))
