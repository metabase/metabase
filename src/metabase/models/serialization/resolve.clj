(ns metabase.models.serialization.resolve
  "Protocols, dynamic vars, and portable-ID utilities for serdes FK resolution.

  This namespace has NO toucan2 dependency — it can be used by lightweight consumers
  (like the checker) that don't need the database."
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s] ;; legacy usages -- do not use in new code
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Protocols
;;; ============================================================

(defprotocol SerdesExportResolver
  "Resolves collections of database ids to portable references during export, each method returning a map from every
  input it found to its reference and leaving out the inputs with no target."
  (export-fks       [this model ids]       "The portable ids (strings, or vectors for nested models) of the `model` rows with `ids`.")
  (export-fks-keyed [this model field ids] "The `field` values of the `model` rows with `ids`.")
  (export-tables    [this table-ids]       "The `[db-name schema table-name]` references of the Tables with `table-ids`.")
  (export-fields    [this field-ids]       "The `[db-name schema table-name & field-names]` references of the Fields with `field-ids`."))

(defprotocol SerdesImportResolver
  "Resolves collections of portable references back to database ids during import, each method returning a map from
  every input it found to its id and leaving out the inputs with no target."
  (import-fks       [this model eids]         "The primary keys of the `model` rows with portable ids `eids`, a vector naming its last element.")
  (import-fks-keyed [this model field values] "The primary keys of the `model` rows whose `field` is one of `values`.")
  (import-users     [this emails]             "The ids of the Users with `emails`, creating inactive ones for the missing emails.")
  (import-databases [this db-names]           "The ids of the Databases named `db-names`, creating stubs for the missing names.")
  (import-tables    [this paths]              "The ids of the Tables at `[db-name schema table-name]` `paths`, creating inactive ones for the missing paths.")
  (import-fields    [this paths]              "The ids of the Fields at `[db-name schema table-name & field-names]` `paths`, creating inactive ones for the missing paths."))

(defprotocol ResettableCache
  "A resolver whose memoized lookups can be dropped."
  (reset-cache! [this] "Drop every memoized lookup."))

;;; ============================================================
;;; References
;;; ============================================================

(defn- grouped-refs
  "The `[kind inputs]` pairs of `refs`, a kind being a reference without its input, in order of first appearance."
  [refs]
  (let [refs   (distinct refs)
        groups (group-by pop refs)]
    (for [kind (distinct (map pop refs))]
      [kind (mapv peek (get groups kind))])))

(defn- resolve-refs
  "The map from each of `refs` to what `resolve-kind`, a fn of a kind and its inputs, finds for it."
  [resolve-kind refs]
  (into {}
        (mapcat (fn [[kind inputs]]
                  (let [found (resolve-kind kind inputs)]
                    (for [input inputs
                          :when (contains? found input)]
                      [(conj kind input) (get found input)]))))
        (grouped-refs refs)))

(defn export-refs
  "The map from each of the export `refs` (`[:fk model id]`, `[:fk-keyed model field id]`, `[:table id]` or
  `[:field id]`) to what `resolver` resolves it to, leaving out the refs with no target."
  [resolver refs]
  (resolve-refs (fn [[k model field] inputs]
                  (case k
                    :fk       (export-fks resolver model inputs)
                    :fk-keyed (export-fks-keyed resolver model field inputs)
                    :table    (export-tables resolver inputs)
                    :field    (export-fields resolver inputs)))
                refs))

(defn import-refs
  "The map from each of the import `refs` (`[:fk model eid]`, `[:fk-keyed model field value]`, `[:user email]`,
  `[:database db-name]`, `[:table path]` or `[:field path]`) to what `resolver` resolves it to, leaving out the refs
  with no target."
  [resolver refs]
  (resolve-refs (fn [[k model field] inputs]
                  (case k
                    :fk       (import-fks resolver model inputs)
                    :fk-keyed (import-fks-keyed resolver model field inputs)
                    :user     (import-users resolver inputs)
                    :database (import-databases resolver inputs)
                    :table    (import-tables resolver inputs)
                    :field    (import-fields resolver inputs)))
                refs))

(defn- export-target-not-found [model id]
  (ex-info "FK target not found" {:model                               model
                                  :id                                  id
                                  :skip                                true
                                  :metabase.models.serialization/type :target-not-found}))

(defn export-ref-value
  "The value `resolved`, from [[export-refs]], holds for `ref`: nil for a missing keyed lookup, and a
  `:target-not-found` error for any other missing target."
  [resolved [k model :as ref]]
  (if (contains? resolved ref)
    (get resolved ref)
    (case k
      :fk-keyed nil
      :fk       (throw (export-target-not-found model (peek ref)))
      :table    (throw (export-target-not-found :model/Table (peek ref)))
      :field    (throw (export-target-not-found :model/Field (peek ref))))))

(defn import-ref-value
  "The value `resolved`, from [[import-refs]], holds for `ref`: a `:target-not-found` error for a missing FK target, and
  nil for any other missing one."
  [resolved [k model :as ref]]
  (cond
    (contains? resolved ref) (get resolved ref)
    (= k :fk)                (let [eid (peek ref)]
                               (throw (ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                                               {:entity_id                           (if (vector? eid) (last eid) eid)
                                                :model                               (name model)
                                                :metabase.models.serialization/type :target-not-found})))
    :else                    nil))

(defn- walk-in-bulk
  "Rewrites each of `xs` with `walk`, a fn of a visitor and a form that replaces every reference in the form with what
  the visitor returns for it: a first walk collects the references, `resolve` resolves them all at once, and a second
  walk turns each resolution into a value with `ref-value`."
  [walk resolve ref-value xs]
  (let [refs     (volatile! [])
        collect  (with-meta (fn [ref] (vswap! refs conj ref) (peek ref)) {::collecting true})
        _        (run! #(walk collect %) xs)
        resolved (resolve @refs)]
    (mapv #(walk (partial ref-value resolved) %) xs)))

(defn collecting?
  "Whether `visit` is the visitor of the first walk of [[walk-in-bulk]], which only collects references and returns
  each input unresolved, so a walk can skip the steps that need resolved values."
  [visit]
  (boolean (::collecting (meta visit))))

(defn export-in-bulk
  "Rewrites each of `xs` with `walk` (see [[walk-in-bulk]]), resolving the export references with `resolver`."
  [resolver walk xs]
  (walk-in-bulk walk #(export-refs resolver %) export-ref-value xs))

(defn import-in-bulk
  "Rewrites each of `xs` with `walk` (see [[walk-in-bulk]]), resolving the import references with `resolver`."
  [resolver walk xs]
  (walk-in-bulk walk #(import-refs resolver %) import-ref-value xs))

;;; ============================================================
;;; Single-reference lookups
;;; ============================================================

(defn- export-one [resolver ref]
  (when (some? (peek ref))
    (export-ref-value (export-refs resolver [ref]) ref)))

(defn- import-one [resolver ref]
  (when (some? (peek ref))
    (import-ref-value (import-refs resolver [ref]) ref)))

(defn export-fk
  "The portable id of the `model` row with `id`, throwing a `:target-not-found` error when there is no such row."
  [resolver id model]
  (export-one resolver [:fk model id]))

(defn export-fk-keyed
  "The `field` value of the `model` row with `id`, or nil."
  [resolver id model field]
  (export-one resolver [:fk-keyed model field id]))

(defn export-user
  "The email of the User with `id`, or nil."
  [resolver id]
  (export-fk-keyed resolver id :model/User :email))

(defn export-table-fk
  "The `[db-name schema table-name]` reference of the Table with `table-id`, throwing a `:target-not-found` error
  when there is no such Table."
  [resolver table-id]
  (export-one resolver [:table table-id]))

(defn export-field-fk
  "The `[db-name schema table-name & field-names]` reference of the Field with `field-id`, throwing a
  `:target-not-found` error when there is no such Field."
  [resolver field-id]
  (export-one resolver [:field field-id]))

(defn import-fk
  "The primary key of the `model` row with portable id `eid`, throwing a `:target-not-found` error when there is no
  such row."
  [resolver eid model]
  (import-one resolver [:fk model eid]))

(defn import-fk-keyed
  "The primary key of the `model` row whose `field` is `portable`, or nil."
  [resolver portable model field]
  (import-one resolver [:fk-keyed model field portable]))

(defn import-user
  "The id of the User with `email`, created as an inactive User when missing."
  [resolver email]
  (import-one resolver [:user email]))

(defn import-database-fk
  "The id of the Database named `db-name`, created as a stub when missing."
  [resolver db-name]
  (import-one resolver [:database db-name]))

(defn import-table-fk
  "The id of the Table at `[db-name schema table-name]` `path`, created as an inactive Table when missing."
  [resolver path]
  (import-one resolver [:table path]))

(defn import-field-fk
  "The id of the Field at `[db-name schema table-name & field-names]` `path`, created as an inactive Field when
  missing."
  [resolver path]
  (import-one resolver [:field path]))

;;; ============================================================
;;; Dynamic vars — bound to resolver instances
;;; ============================================================

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *export-resolver*
  "The current `SerdesExportResolver` instance. Bound during export."
  nil)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *import-resolver*
  "The current `SerdesImportResolver` instance. Bound during import."
  nil)

;;; ============================================================
;;; Agent surface
;;; ============================================================

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *numeric-ids-allowed?*
  "Whether bare numeric table/field/card ids are accepted alongside portable references inside
  a query body being resolved.

  False is the default, and the safe direction: a numeric id is rejected with a teaching error
  rather than resolved against whatever row happens to carry that id. True means the caller has
  established that its surface may author bare ids, and accepts that every id it passes is an
  untrusted integer — so the readers gated on this flag re-derive, explicitly, the guarantees a
  portable reference gets for free from resolving a name (in this database, visible, readable).

  It is ambient rather than a parameter because one of its readers is a registered Malli schema
  predicate, which has no call site to thread a value through."
  false)

;;; ============================================================
;;; Pure predicates
;;; ============================================================

(defn entity-id?
  "Checks if the given string is a 21-character NanoID."
  [id-str]
  (boolean (and id-str
                (string? id-str)
                (re-matches #"^[A-Za-z0-9_-]{21}$" id-str))))

(defn- portable-id?
  "True if the provided string is an Entity ID."
  [s]
  (and (string? s)
       (entity-id? s)))

(defn- numeric-source-id?
  "True for a bare numeric content id, and only on a surface that accepts them (see
  [[*numeric-ids-allowed?*]]). Off that surface a number in a source slot is not a reference at
  all, so it must not match — that is what keeps the portable-only surface's behavior unchanged."
  [x]
  (and (pos-int? x) *numeric-ids-allowed?*))

(defn- content-ref?
  "True for any reference to Metabase content the numeric dialect covers — a card, metric,
  segment, or measure — that this surface may author: a portable entity_id, or, on the
  numeric-id surface, a bare id. Snippets are deliberately not included; see the `snippet-id`
  branch below.

  Every `import-mbql` branch that resolves content goes through this one predicate rather than
  matching `portable-id?` and gaining a numeric twin. The numeric form needs no translation, but
  it must still reach `import-fk`, because that is what consults the content store — and on
  agent paths the store is `read-checked`, so the lookup *is* the permission check. A branch
  that matched only the portable form would silently let a numeric id past it unchecked."
  [x]
  (or (portable-id? x)
      (numeric-source-id? x)))

(defn serialized-query-source-table
  "Given a serialized query (with portable references), returns the portable reference of the table it is based
  on. Measures and segments use this to omit the table_id property when it is derivable from the query. This should be
  an mbql query and not a native query."
  [serialized-query]
  (mu/disable-enforcement
    (lib/primary-source-table-id serialized-query)))

;;; ============================================================
;;; MBQL walkers
;;; ============================================================

(mr/def ::mbql-node
  "Any node reached while walking an MBQL form, which may or may not be an MBQL clause."
  [:schema {::mr/deliberately-open true, :description "an MBQL form node"} :any])

(mu/defn mbql-clause-tag :- [:maybe [:enum :field :field-id :dimension :metric :segment :measure]]
  "The tag of `form` when it is an MBQL entity reference clause, else nil."
  [form :- [:ref ::mbql-node]]
  (when (and (vector? form)
             (#{:field :field-id :dimension :metric :segment :measure} (keyword (first form))))
    (keyword (first form))))

(mr/def ::field-ref
  "MBQL 5 or legacy `:field` clause. Registered under a keyword so [[lib/normalize]] reuses one cached coercer; an
  inline literal with a fresh dispatch fn misses the registry cache on every call."
  [:multi
   {:dispatch #(and (vector? %)
                    (map? (second %)))}
   [true  :mbql.clause/field]
   [false ::mbql.s/field]])

(mr/def ::mbql-3-field-id-ref
  "Ultra-legacy MBQL 3 `:field-id` ref, which (allegedly) can show up in viz settings."
  [:tuple
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :field-id]
   pos-int?])

(defn normalize-mbql-ref
  "`mbql`, an MBQL entity reference clause, normalized by the schema of its tag."
  [mbql]
  (let [schema (case (mbql-clause-tag mbql)
                 :field-id  ::mbql-3-field-id-ref
                 :field     ::field-ref
                 :dimension ::lib.schema.parameter/dimension
                 :metric    :mbql.clause/metric
                 :segment   :mbql.clause/segment
                 :measure   :mbql.clause/measure
                 nil)]
    (cond->> mbql
      schema (lib/normalize schema mbql))))

(def ^:private ref-tag->model
  {:metric :model/Card, :segment :model/Segment, :measure :model/Measure})

(declare walk-export-mbql)

(defn- export-mbql-map [visit m]
  (reduce-kv
   (fn [m k v]
     (case k
       :lib/metadata
       (dissoc m k)

       :database
       (assoc m k (cond
                    (= v lib.schema.id/saved-questions-virtual-database-id) "database/__virtual"
                    (pos-int? v)                                            (visit [:fk-keyed :model/Database :name v])
                    :else                                                   v))

       (:card_id :card-id :source_card :source-card)
       (cond-> m (pos-int? v) (assoc k (visit [:fk :model/Card v])))

       (:source_table :source-table :table-id)
       (cond-> m (pos-int? v) (assoc k (visit [:table v])))

       (:source-field ::mb.viz/param-mapping-source)
       (cond-> m (pos-int? v) (assoc k (visit [:field v])))

       :segment
       (cond-> m (pos-int? v) (assoc k (visit [:fk :model/Segment v])))

       :snippet-id
       (cond-> m (pos-int? v) (assoc k (visit [:fk :model/NativeQuerySnippet v])))

       (assoc m k (walk-export-mbql visit v))))
   m
   m))

(defn- export-mbql-clause [visit [tag a b :as clause]]
  (let [walk #(walk-export-mbql visit %)]
    (case tag
      (:field :field-id)
      (cond
        (and (= 2 (count clause)) (pos-int? a))     [tag (visit [:field a])]
        (and (map? a) (pos-int? b))                 [tag (walk a) (visit [:field b])]
        (and (pos-int? a) (or (map? b) (nil? b)))   [tag (visit [:field a]) (walk b)]
        :else                                       (mapv walk clause))

      (:metric :segment :measure)
      (if (and (= 3 (count clause)) (pos-int? b))
        [tag (walk a) (visit [:fk (ref-tag->model tag) b])]
        (mapv walk clause))

      (mapv walk clause))))

(defn walk-export-mbql
  "`x`, any form that may hold MBQL, with the Database, Table, Field and content ids in it replaced by what `visit`
  returns for their references (see [[export-refs]])."
  [visit x]
  (cond
    (mbql-clause-tag x) (export-mbql-clause visit (normalize-mbql-ref x))
    (sequential? x)     (mapv #(walk-export-mbql visit %) x)
    (map? x)            (export-mbql-map visit x)
    :else               x))

(defn export-mbql
  "Each of `xs`, forms that may hold MBQL, with its database ids turned into portable references by `resolver`."
  [resolver xs]
  (export-in-bulk resolver walk-export-mbql xs))

(declare walk-import-mbql)

(defn- import-mbql-map [visit m]
  (reduce-kv
   (fn [m k v]
     (case k
       :database
       (cond-> m
         (string? v) (assoc k (if (= v "database/__virtual")
                                lib.schema.id/saved-questions-virtual-database-id
                                (visit [:database v]))))

       (:source-table :source_table)
       (cond
         (vector? v)      (assoc m k (visit [:table v]))
         (portable-id? v) (assoc m k (str "card__" (visit [:fk :model/Card v])))
         :else            m)

       (:table-id)
       (cond-> m (vector? v) (assoc k (visit [:table v])))

       :source-field
       (cond-> m (vector? v) (assoc k (visit [:field v])))

       (:source-card :card-id)
       (cond-> m (content-ref? v) (assoc k (visit [:fk :model/Card v])))

       :snippet-id
       (cond-> m (portable-id? v) (assoc k (visit [:fk :model/NativeQuerySnippet v])))

       (assoc m k (walk-import-mbql visit v))))
   m
   m))

(defn- import-mbql-clause [visit [tag a b :as clause]]
  (let [walk #(walk-import-mbql visit %)
        kw   (keyword tag)]
    (case kw
      (:field :field-id)
      (cond
        (and (= 2 (count clause)) (vector? a))                       [:field (visit [:field a]) nil]
        (and (= :field kw) (map? a) (vector? b))                     [:field (walk a) (visit [:field b])]
        (and (= :field kw) (vector? a) (or (map? b) (nil? b)))       [:field (visit [:field a]) (some->> b walk)]
        :else                                                        (mapv walk clause))

      (:metric :segment :measure)
      (cond
        (and (= 3 (count clause)) (content-ref? b)) [kw (walk a) (visit [:fk (ref-tag->model kw) b])]
        (and (= 2 (count clause)) (content-ref? a)) [kw (visit [:fk (ref-tag->model kw) a])]
        :else                                       (mapv walk clause))

      (mapv walk clause))))

(defn walk-import-mbql
  "`x`, any form that may hold MBQL with portable references, with those references replaced by what `visit` returns
  for them (see [[import-refs]])."
  [visit x]
  (cond
    (and (vector? x) (some-> (first x) keyword #{:field :field-id :metric :segment :measure}))
    (import-mbql-clause visit x)

    (map? x)        (import-mbql-map visit x)
    (vector? x)     (mapv #(walk-import-mbql visit %) x)
    (sequential? x) (doall (map #(walk-import-mbql visit %) x))
    :else           x))

(defn import-mbql
  "Each of `xs`, forms that may hold MBQL with portable references, with those references turned into database ids
  by `resolver`."
  [resolver xs]
  (import-in-bulk resolver walk-import-mbql xs))
