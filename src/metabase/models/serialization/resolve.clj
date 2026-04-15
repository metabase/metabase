(ns metabase.models.serialization.resolve
  "Protocols, dynamic vars, and portable-ID utilities for serdes FK resolution.

  This namespace has NO toucan2 dependency — it can be used by lightweight consumers
  (like the checker) that don't need the database."
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s] ;; legacy usages -- do not use in new code
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Protocols
;;; ============================================================

(defprotocol SerdesExportResolver
  "Resolve database IDs to portable references during export."
  (export-fk        [this id model]        "Given a numeric FK and model, return a portable ID (string or vector).")
  (export-fk-keyed  [this id model field]  "Given a numeric ID, look up a different identifying field.")
  (export-user      [this id]              "Export a user as their email address.")
  (export-table-fk  [this table-id]        "Given a numeric table_id, return [db-name schema table-name].")
  (export-field-fk  [this field-id]        "Given a numeric field_id, return [db-name schema table-name field-name]."))

(defprotocol SerdesImportResolver
  "Resolve portable references back to database IDs during import."
  (import-fk        [this eid model]       "Given a portable ID and model, return the numeric PK.")
  (import-fk-keyed  [this portable model field] "Given a portable identifying field value, return the numeric :id.")
  (import-user      [this email]           "Import a user by email, creating if needed. Returns PK.")
  (import-table-fk  [this path]            "Given [db-name schema table-name], return numeric table_id.")
  (import-field-fk  [this path]            "Given [db-name schema table-name field-name], return numeric field_id."))

;;; ============================================================
;;; Dynamic vars — bound to resolver instances
;;; ============================================================

(def ^:dynamic *export-resolver*
  "The current `SerdesExportResolver` instance. Bound during export."
  nil)

(def ^:dynamic *import-resolver*
  "The current `SerdesImportResolver` instance. Bound during import."
  nil)

;;; ============================================================
;;; Pure predicates
;;; ============================================================

(defn entity-id?
  "Checks if the given string is a 21-character NanoID."
  [id-str]
  (boolean (and id-str
                (string? id-str)
                (re-matches #"^[A-Za-z0-9_-]{21}$" id-str))))

(defn identity-hash?
  "Returns true if s is a valid identity hash string."
  [s]
  (boolean (re-matches #"^[0-9a-fA-F]{8}$" s)))

(defn- portable-id?
  "True if the provided string is either an Entity ID or identity-hash string."
  [s]
  (and (string? s)
       (or (entity-id? s)
           (identity-hash? s))))

;;; ============================================================
;;; import-mbql — depends only on protocols, lib.util.match, lib.schema.id
;;; ============================================================

(defn- mbql-fully-qualified-names->ids*
  [resolver entity]
  (lib.util.match/replace-lite entity
    [#{:field "field"} (opts :guard map?) (fully-qualified-name :guard vector?)]
    [:field (mbql-fully-qualified-names->ids* resolver opts)
     (import-field-fk resolver fully-qualified-name)]

    ;; legacy field refs, still used in parameters and result metadata `field_ref`
    [#{:field "field"} (fully-qualified-name :guard vector?) (opts :guard (some-fn map? nil))]
    [:field (import-field-fk resolver fully-qualified-name) (some->> opts (mbql-fully-qualified-names->ids* resolver))]

    ;; MBQL 3 `:field-id` can (allegedly) still show up sometimes? Support it just in case.
    [(tag :guard #{:field :field-id "field" "field-id"}) (id :guard vector?)]
    [:field (import-field-fk resolver id) nil]

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard vector?)}
    (assoc &match :source-field (import-field-fk resolver fully-qualified-name))

    {:database (fully-qualified-name :guard string?)}
    (-> &match
        (assoc :database (if (= fully-qualified-name "database/__virtual")
                           lib.schema.id/saved-questions-virtual-database-id
                           (import-fk-keyed resolver fully-qualified-name :model/Database :name)))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:card-id (entity-id :guard portable-id?)}
    (-> &match
        (assoc :card-id (import-fk resolver entity-id 'Card))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    [#{:metric "metric"} opts (entity-id :guard portable-id?)]
    [:metric (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Card)]

    [#{:segment "segment"} opts (entity-id :guard portable-id?)]
    [:segment (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Segment)]

    [#{:measure "measure"} opts (entity-id :guard portable-id?)]
    [:measure (mbql-fully-qualified-names->ids* resolver opts)
     (import-fk resolver entity-id 'Measure)]

    ;; support legacy MBQL 4 refs for things like the serialized Audit v2 queries
    [#{:metric "metric"} (entity-id :guard portable-id?)]
    [:metric (import-fk resolver entity-id 'Card)]

    [#{:segment "segment"} (entity-id :guard portable-id?)]
    [:segment (import-fk resolver entity-id 'Segment)]

    [#{:measure "measure"} (entity-id :guard portable-id?)]
    [:measure (import-fk resolver entity-id 'Measure)]

    {:source-table (_ :guard vector?)}
    (-> &match
        (update :source-table (partial import-table-fk resolver))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:source_table (_ :guard vector?)}
    (-> &match
        (update :source_table (partial import-table-fk resolver))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    ;; support legacy MBQL 4 for the Audit v2 queries
    {:source-table (id :guard portable-id?)}
    (-> &match
        (assoc :source-table (str "card__" (import-fk resolver id 'Card)))
        (->> (mbql-fully-qualified-names->ids* resolver)))

    {:source-card (id :guard portable-id?)}
    (-> &match
        (assoc :source-card (import-fk resolver id 'Card))
        (->> (mbql-fully-qualified-names->ids* resolver)))

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

(mu/defn- mbql-clause-tag :- [:maybe [:enum :field :dimension :metric :segment :measure]]
  "Is given form an MBQL entity reference?"
  [form]
  (when (and (vector? form)
             (#{:field :dimension :metric :segment :measure} (keyword (first form))))
    (keyword (first form))))

(defn- normalize [mbql]
  (let [tag    (mbql-clause-tag mbql)
        schema (case tag
                 :field     [:multi
                             {:dispatch #(and (vector? %)
                                              (map? (second %)))}
                             [true  :mbql.clause/field]
                             [false ::mbql.s/field]] ; legacy MBQL clause
                 :dimension ::lib.schema.parameter/dimension
                 :metric    :mbql.clause/metric
                 :segment   :mbql.clause/segment
                 :measure   :mbql.clause/measure
                 #_else     nil)]
    (cond->> mbql
      schema (lib/normalize schema mbql))))

(defn- mbql-id->fully-qualified-name
  [resolver mbql]
  (lib.util.match/replace-lite (normalize mbql)
    ;; `pos-int?` guard is here to make the operation idempotent
    [:field (opts :guard map?) (id :guard pos-int?)]
    [:field (mbql-id->fully-qualified-name resolver opts) (export-field-fk resolver id)]

    ;; legacy (MBQL 4) field refs are still supported in parameter targets and in result metadata `field_ref`...
    [:field (id :guard pos-int?) (opts :guard (some-fn map? nil?))]
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
   (lib.util.match/replace-lite entity
     (_ :guard mbql-clause-tag)
     (mbql-id->fully-qualified-name resolver &match)

     (_ :guard sequential?)
     (mapv export-mbql &match)

     (_ :guard map?)
     (reduce-kv
      (fn [entity k _v]
        (let [f (case k
                  :database                     (fn [db-id]
                                                  (if (= db-id lib.schema.id/saved-questions-virtual-database-id)
                                                    "database/__virtual"
                                                    (export-fk-keyed resolver db-id :model/Database :name)))
                  (:card_id :card-id)           #(export-fk resolver % :model/Card) ; attributes that refer to db fields use `_`; template-tags use `-`
                  (:source_table :source-table) #(export-table-fk resolver %)
                  (:source_card :source-card)   #(export-fk resolver % :model/Card)
                  ::mb.viz/param-mapping-source #(export-field-fk resolver %)
                  :segment                      #(export-fk resolver % :model/Segment)
                  :snippet-id                   #(export-fk resolver % :model/NativeQuerySnippet)
                  :lib/metadata                 (constantly nil)
                  #_else                        (partial export-mbql resolver))]
          (update entity k f)))
      &match
      &match))))
