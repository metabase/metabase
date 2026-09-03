(ns metabase.lib-be.db
  "Application database queries for the lib backend module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(defn database
  "The `:metadata/database` with `database-id`, or nil."
  [database-id]
  (t2/select-one :metadata/database database-id))

;;; ----------------------------------------------- Lib metadata -----------------------------------------------
;;;
;;; Each `:metadata/*` type below is a distinct Toucan 2 model. `metadata-where` is a private helper shared by the
;;; per-type functions; it is never exposed, so callers always pick the model by calling the right function.

(defn- db-id-key [metadata-type]
  (case metadata-type
    :metadata/table                :db_id
    :metadata/column               :table/db_id
    :metadata/card                 :card/database_id
    :metadata/metric               :database_id
    :metadata/segment              :table/db_id
    :metadata/measure              :table/db_id
    :metadata/native-query-snippet nil
    :metadata/transform            nil))

(defn- id-key [metadata-type]
  (case metadata-type
    :metadata/table                :id
    :metadata/column               :field/id
    :metadata/card                 :card/id
    :metadata/metric               :id
    :metadata/segment              :segment/id
    :metadata/measure              :measure/id
    :metadata/native-query-snippet :id
    :metadata/transform            :id))

(defn- name-key [metadata-type]
  (case metadata-type
    :metadata/table                :name
    :metadata/column               :field/name
    :metadata/card                 :card/name
    :metadata/metric               :name
    :metadata/segment              :segment/name
    :metadata/measure              :measure/name
    :metadata/native-query-snippet :name
    :metadata/transform            :name))

(defn- table-id-key [metadata-type]
  ;; types not in the case statement do not support Table ID
  (case metadata-type
    :metadata/column  :field/table_id
    :metadata/metric  :table_id
    :metadata/segment :segment/table_id
    :metadata/measure :measure/table_id))

(defn- card-id-key [metadata-type]
  ;; types not in the case statement do not support Card ID
  (case metadata-type
    :metadata/metric :source_card_id))

(defn- active-only-where [metadata-type include-sensitive?]
  (case metadata-type
    :metadata/table
    [:and
     [:= :active true]
     [:or
      [:= :visibility_type nil]
      [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]

    :metadata/column
    (let [excluded-visibility-types (cond-> ["retired"]
                                      (not include-sensitive?) (conj "sensitive"))]
      [:and
       [:= :field/active true]
       [:or
        [:= :field/visibility_type nil]
        [:not-in :field/visibility_type excluded-visibility-types]]])

    :metadata/card
    [:= :card/archived false]

    :metadata/metric
    [:= :archived false]

    :metadata/segment
    [:= :segment/archived false]

    :metadata/measure
    [:= :measure/archived false]

    #_else
    nil))

(mu/defn- metadata-where :- [:map {:closed true} [:where {:optional true} vector?]]
  "The `:where` map picking out the `metadata-type` rows for `database-id`, narrowed by `metadata-spec`'s `:id`,
  `:name`, `:table-ids`, and `:card-ids` (whichever apply to `metadata-type`), or restricted to active/visible
  rows when none of `:id`/`:name` is given (`:include-sensitive?` controlling whether sensitive columns count
  as active). This should match [[metabase.lib.metadata.protocols/default-spec-filter-xform]] as closely as
  possible."
  [metadata-type :- ::lib.metadata.protocols/metadata-type-excluding-database
   database-id   :- ::lib.schema.id/database
   {id-set :id, name-set :name, :keys [table-ids card-ids include-sensitive?]} :- ::lib.metadata.protocols/metadata-spec]
  (let [database-id-key (db-id-key metadata-type)
        active-only?    (not (or id-set name-set))
        metric?         (= metadata-type :metadata/metric)
        where-clauses   (cond-> []
                          database-id-key         (conj [:= database-id-key database-id])
                          id-set                  (conj [:in (id-key metadata-type) id-set])
                          name-set                (conj [:in (name-key metadata-type) name-set])
                          table-ids               (conj [:in (table-id-key metadata-type) table-ids])
                          card-ids                (conj [:in (card-id-key metadata-type) card-ids])
                          active-only?            (conj (active-only-where metadata-type include-sensitive?))
                          metric?                 (conj [:= :type "metric"])
                          (and metric? table-ids) (conj [:= :source_card_id nil]))]
    (reduce sql.helpers/where {} where-clauses)))

(defn tables
  "The `:metadata/table` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/table (metadata-where :metadata/table database-id metadata-spec)))

(defn columns
  "The `:metadata/column` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/column (metadata-where :metadata/column database-id metadata-spec)))

(defn cards
  "The `:metadata/card` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/card (metadata-where :metadata/card database-id metadata-spec)))

(defn metrics
  "The `:metadata/metric` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/metric (metadata-where :metadata/metric database-id metadata-spec)))

(defn segments
  "The `:metadata/segment` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/segment (metadata-where :metadata/segment database-id metadata-spec)))

(defn measures
  "The `:metadata/measure` rows for `database-id` picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/measure (metadata-where :metadata/measure database-id metadata-spec)))

(defn native-query-snippets
  "The `:metadata/native-query-snippet` rows picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/native-query-snippet (metadata-where :metadata/native-query-snippet database-id metadata-spec)))

(defn transforms
  "The `:metadata/transform` rows picked out by `metadata-spec`."
  [database-id metadata-spec]
  (t2/select :metadata/transform (metadata-where :metadata/transform database-id metadata-spec)))
