(ns metabase.models.serialization.resolve
  "Protocols, dynamic vars, and portable-ID utilities for serdes FK resolution.

  This namespace has NO toucan2 dependency — it can be used by lightweight consumers
  (like the checker) that don't need the database."
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s] ;; legacy usages -- do not use in new code
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]))

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
;;; Single-reference lookups
;;; ============================================================

(defn- export-target-not-found [model id]
  (ex-info "FK target not found" {:model                               model
                                  :id                                  id
                                  :skip                                true
                                  :metabase.models.serialization/type :target-not-found}))

(defn- resolved-or-throw
  "The value `resolved` maps `k` to, throwing the ex-info `not-found` returns when `resolved` has no entry for `k`."
  [resolved k not-found]
  (if (contains? resolved k)
    (get resolved k)
    (throw (not-found))))

(defn export-fk
  "The portable id of the `model` row with `id`, throwing a `:target-not-found` error when there is no such row."
  [resolver id model]
  (when (some? id)
    (resolved-or-throw (export-fks resolver model [id]) id #(export-target-not-found model id))))

(defn export-fk-keyed
  "The `field` value of the `model` row with `id`, or nil."
  [resolver id model field]
  (when (some? id)
    (get (export-fks-keyed resolver model field [id]) id)))

(defn export-user
  "The email of the User with `id`, or nil."
  [resolver id]
  (export-fk-keyed resolver id :model/User :email))

(defn export-table-fk
  "The `[db-name schema table-name]` reference of the Table with `table-id`, throwing a `:target-not-found` error
  when there is no such Table."
  [resolver table-id]
  (when (some? table-id)
    (resolved-or-throw (export-tables resolver [table-id]) table-id #(export-target-not-found :model/Table table-id))))

(defn export-field-fk
  "The `[db-name schema table-name & field-names]` reference of the Field with `field-id`, throwing a
  `:target-not-found` error when there is no such Field."
  [resolver field-id]
  (when (some? field-id)
    (resolved-or-throw (export-fields resolver [field-id]) field-id #(export-target-not-found :model/Field field-id))))

(defn import-fk
  "The primary key of the `model` row with portable id `eid`, throwing a `:target-not-found` error when there is no
  such row."
  [resolver eid model]
  (when (some? eid)
    (resolved-or-throw (import-fks resolver model [eid])
                       eid
                       #(ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                                 {:entity_id                           (if (vector? eid) (last eid) eid)
                                  :model                               (name model)
                                  :metabase.models.serialization/type :target-not-found}))))

(defn import-fk-keyed
  "The primary key of the `model` row whose `field` is `portable`, or nil."
  [resolver portable model field]
  (when (some? portable)
    (get (import-fks-keyed resolver model field [portable]) portable)))

(defn import-user
  "The id of the User with `email`, created as an inactive User when missing."
  [resolver email]
  (when (some? email)
    (get (import-users resolver [email]) email)))

(defn import-database-fk
  "The id of the Database named `db-name`, created as a stub when missing."
  [resolver db-name]
  (when (some? db-name)
    (get (import-databases resolver [db-name]) db-name)))

(defn import-table-fk
  "The id of the Table at `[db-name schema table-name]` `path`, created as an inactive Table when missing."
  [resolver path]
  (when (some? path)
    (get (import-tables resolver [path]) path)))

(defn import-field-fk
  "The id of the Field at `[db-name schema table-name & field-names]` `path`, created as an inactive Field when
  missing."
  [resolver path]
  (when (some? path)
    (get (import-fields resolver [path]) path)))

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
;;; import-mbql — depends only on protocols, match, lib.schema.id
;;; ============================================================

(defn- mbql-fully-qualified-names->ids*
  [resolver entity]
  (match/replace entity
    [#{:field "field"} (opts :guard map?) (fully-qualified-name :guard vector?)]
    [:field (mbql-fully-qualified-names->ids* resolver opts)
     (import-field-fk resolver fully-qualified-name)]

    ;; legacy field refs, still used in parameters and result metadata `field_ref`
    [#{:field "field"} (fully-qualified-name :guard vector?) (opts :guard (or (map? opts) (nil? opts)))]
    [:field (import-field-fk resolver fully-qualified-name) (some->> opts (mbql-fully-qualified-names->ids* resolver))]

    ;; MBQL 3 `:field-id` can (allegedly) still show up sometimes? Support it just in case.
    [#{:field :field-id "field" "field-id"} (id :guard vector?)]
    [:field (import-field-fk resolver id) nil]

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard vector?)}
    (assoc &match :source-field (import-field-fk resolver fully-qualified-name))

    {:database (fully-qualified-name :guard string?)}
    (-> &match
        (assoc :database (if (= fully-qualified-name "database/__virtual")
                           lib.schema.id/saved-questions-virtual-database-id
                           (import-database-fk resolver fully-qualified-name)))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:card-id (entity-id :guard content-ref?)}
    (-> &match
        (assoc :card-id (import-fk resolver entity-id 'Card))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    [#{:metric "metric"} opts (entity-id :guard content-ref?)]
    [:metric (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Card)]

    [#{:segment "segment"} opts (entity-id :guard content-ref?)]
    [:segment (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Segment)]

    [#{:measure "measure"} opts (entity-id :guard content-ref?)]
    [:measure (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Measure)]

    ;; support legacy MBQL 4 refs for things like the serialized Audit v2 queries
    [#{:metric "metric"} (entity-id :guard content-ref?)]
    [:metric (import-fk resolver entity-id 'Card)]

    [#{:segment "segment"} (entity-id :guard content-ref?)]
    [:segment (import-fk resolver entity-id 'Segment)]

    [#{:measure "measure"} (entity-id :guard content-ref?)]
    [:measure (import-fk resolver entity-id 'Measure)]

    {:source-table #'vector?}
    (-> &match
        (update :source-table (partial import-table-fk resolver))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:source_table #'vector?}
    (-> &match
        (update :source_table (partial import-table-fk resolver))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:table-id #'vector?}
    (-> &match
        (update :table-id (partial import-table-fk resolver))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    ;; support legacy MBQL 4 for the Audit v2 queries
    {:source-table (id :guard portable-id?)}
    (-> &match
        (assoc :source-table (str "card__" (import-fk resolver id 'Card)))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:source-card (id :guard content-ref?)}
    ;; Recur on the rest of the map, not on `&match`: `import-fk` of a numeric id returns a
    ;; numeric id, which still satisfies `content-ref?`, so recurring on the whole match would
    ;; re-enter this branch on its own output forever. The `:source-table` branch escapes only
    ;; because it rewrites the value to "card__N" and no longer matches.
    (assoc (mbql-fully-qualified-names->ids* resolver (dissoc &match :source-card))
           :source-card (import-fk resolver id 'Card))

    ;; Portable only, deliberately. The numeric dialect does not cover snippets: no resolver
    ;; implements `NativeQuerySnippet`, so a numeric one would fall through `import-fk`'s model
    ;; tests to `not-implemented!` and surface as a bare 501 with no `:agent-error?` — never
    ;; reaching the read-checked store. Widening this needs a store-backed snippet branch first.
    {:snippet-id (id :guard portable-id?)}
    (-> &match
        (assoc :snippet-id (import-fk resolver id 'NativeQuerySnippet))
        (->> (mbql-fully-qualified-names->ids* resolver)))))

(defn import-mbql
  "Given an MBQL expression with portable IDs, convert back to numeric IDs.
  Uses `*import-resolver*` if bound, otherwise requires a resolver argument."
  ([exported]
   (import-mbql *import-resolver* exported))
  ([resolver exported]
   (mbql-fully-qualified-names->ids* resolver exported)))

(mr/def ::mbql-node
  "Any node reached while walking an MBQL form being imported, which may or may not be an MBQL clause."
  [:schema {::mr/deliberately-open true, :description "an MBQL form node"} :any])

(mu/defn- mbql-clause-tag :- [:maybe [:enum :field :dimension :metric :segment :measure]]
  "Is given form an MBQL entity reference?"
  [form :- [:ref ::mbql-node]]
  (when (and (vector? form)
             (#{:field :dimension :metric :segment :measure} (keyword (first form))))
    (keyword (first form))))

(mr/def ::field-ref
  "MBQL 5 or legacy `:field` clause. Registered under a keyword so [[lib/normalize]] reuses one cached coercer; an
  inline literal with a fresh dispatch fn misses the registry cache on every call."
  [:multi
   {:dispatch #(and (vector? %)
                    (map? (second %)))}
   [true  :mbql.clause/field]
   [false ::mbql.s/field]])

(defn- normalize [mbql]
  (let [tag    (mbql-clause-tag mbql)
        schema (case tag
                 :field     ::field-ref
                 :dimension ::lib.schema.parameter/dimension
                 :metric    :mbql.clause/metric
                 :segment   :mbql.clause/segment
                 :measure   :mbql.clause/measure
                 #_else     nil)]
    (cond->> mbql
      schema (lib/normalize schema mbql))))

(defn- mbql-id->fully-qualified-name
  [resolver mbql]
  (match/replace (normalize mbql)
    ;; `pos-int?` guard is here to make the operation idempotent
    [:field (opts :guard map?) (id :guard pos-int?)]
    [:field (mbql-id->fully-qualified-name resolver opts) (export-field-fk resolver id)]

    ;; legacy (MBQL 4) field refs are still supported in parameter targets and in result metadata `field_ref`...
    [:field (id :guard pos-int?) (opts :guard (or (map? opts) (nil? opts)))]
    [:field (export-field-fk resolver id) (mbql-id->fully-qualified-name resolver opts)]

    ;; MBQL 3 `:field-id` can (allegedly) still show up sometimes? Support it just in case.
    [(tag :guard #{:field :field-id}) (id :guard pos-int?)]
    [tag (export-field-fk resolver id)]

    {:source-table (id :guard pos-int?)}
    (assoc &match :source-table (export-table-fk resolver id))

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (id :guard pos-int?)}
    (assoc &match :source-field (export-field-fk resolver id))

    [:dimension (dim :guard vector?)]
    [:dimension (mbql-id->fully-qualified-name resolver dim)]

    [:metric opts (id :guard pos-int?)]
    [:metric (mbql-id->fully-qualified-name resolver opts) (export-fk resolver id 'Card)]

    [:segment opts (id :guard pos-int?)]
    [:segment (mbql-id->fully-qualified-name resolver opts) (export-fk resolver id 'Segment)]

    [:measure opts (id :guard pos-int?)]
    [:measure (mbql-id->fully-qualified-name resolver opts) (export-fk resolver id 'Measure)]))

(defn export-mbql
  "Given an MBQL expression, convert it to an EDN structure and turn the non-portable Database, Table and Field IDs
  inside it into portable references."
  ([entity] (export-mbql *export-resolver* entity))
  ([resolver entity]
   (match/replace entity
     #'mbql-clause-tag
     (mbql-id->fully-qualified-name resolver &match)

     #'sequential?
     (mapv (partial export-mbql resolver) &match)

     #'map?
     (reduce-kv
      (fn [entity k _v]
        (let [f (case k
                  :database                     (fn [db-id]
                                                  (if (= db-id lib.schema.id/saved-questions-virtual-database-id)
                                                    "database/__virtual"
                                                    (export-fk-keyed resolver db-id :model/Database :name)))
                  (:card_id :card-id)           #(export-fk resolver % :model/Card) ; attributes that refer to db fields use `_`; template-tags use `-`
                  (:source_table :source-table) #(export-table-fk resolver %)
                  :table-id                     #(cond->> % (pos-int? %) (export-table-fk resolver))
                  (:source_card :source-card)   #(export-fk resolver % :model/Card)
                  ::mb.viz/param-mapping-source #(export-field-fk resolver %)
                  :segment                      #(export-fk resolver % :model/Segment)
                  :snippet-id                   #(export-fk resolver % :model/NativeQuerySnippet)
                  :lib/metadata                 (constantly nil)
                  #_else                        (partial export-mbql resolver))]
          (update entity k f)))
      &match
      &match))))
