(ns metabase.lib-be.db
  "Application database queries for the lib backend module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]))

(mu/defn card-database-ids
  "The `:id` and `:database_id` of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id] :id [:in card-ids]))

(mu/defn database
  "The `:metadata/database` with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :metadata/database :id database-id))

;;; ----------------------------------------------- Lib metadata -----------------------------------------------
;;;
;;; Each `:metadata/*` type below is a distinct Toucan 2 model. `metadata-where` is a private helper shared by the
;;; per-type functions; it is never exposed, so callers always pick the model by calling the right function.

(defn- database-id-clause [metadata-type database-id]
  (case metadata-type
    :metadata/table                (t2/fragment [:= :db_id database-id])
    :metadata/column               (t2/fragment [:= :table/db_id database-id])
    :metadata/card                 (t2/fragment [:= :card/database_id database-id])
    :metadata/metric               (t2/fragment [:= :database_id database-id])
    :metadata/segment              (t2/fragment [:= :table/db_id database-id])
    :metadata/measure              (t2/fragment [:= :table/db_id database-id])
    :metadata/native-query-snippet nil
    :metadata/transform            nil))

(defn- id-clause [metadata-type id-set]
  (case metadata-type
    :metadata/table                (t2/fragment [:in :id id-set])
    :metadata/column               (t2/fragment [:in :field/id id-set])
    :metadata/card                 (t2/fragment [:in :card/id id-set])
    :metadata/metric               (t2/fragment [:in :id id-set])
    :metadata/segment              (t2/fragment [:in :segment/id id-set])
    :metadata/measure              (t2/fragment [:in :measure/id id-set])
    :metadata/native-query-snippet (t2/fragment [:in :id id-set])
    :metadata/transform            (t2/fragment [:in :id id-set])))

(defn- name-clause [metadata-type name-set]
  (case metadata-type
    :metadata/table                (t2/fragment [:in :name name-set])
    :metadata/column               (t2/fragment [:in :field/name name-set])
    :metadata/card                 (t2/fragment [:in :card/name name-set])
    :metadata/metric               (t2/fragment [:in :name name-set])
    :metadata/segment              (t2/fragment [:in :segment/name name-set])
    :metadata/measure              (t2/fragment [:in :measure/name name-set])
    :metadata/native-query-snippet (t2/fragment [:in :name name-set])
    :metadata/transform            (t2/fragment [:in :name name-set])))

(defn- table-id-clause
  "The Table ID clause of the types that support it; any other type throws."
  [metadata-type table-ids]
  (case metadata-type
    :metadata/column  (t2/fragment [:in :field/table_id table-ids])
    :metadata/metric  (t2/fragment [:in :table_id table-ids])
    :metadata/segment (t2/fragment [:in :segment/table_id table-ids])
    :metadata/measure (t2/fragment [:in :measure/table_id table-ids])))

(defn- card-id-clause
  "The Card ID clause of the types that support it; any other type throws."
  [metadata-type card-ids]
  (case metadata-type
    :metadata/metric (t2/fragment [:in :source_card_id card-ids])))

(defn- active-only-where [metadata-type include-sensitive?]
  (case metadata-type
    :metadata/table
    (t2/fragment
     [:and
      [:= :active true]
      [:or
       [:= :visibility_type nil]
       [:not-in :visibility_type ["hidden" "technical" "cruft"]]]])

    :metadata/column
    (let [excluded-visibility-types (cond-> ["retired"]
                                      (not include-sensitive?) (conj "sensitive"))]
      (t2/fragment
       [:and
        [:= :field/active true]
        [:or
         [:= :field/visibility_type nil]
         [:not-in :field/visibility_type excluded-visibility-types]]]))

    :metadata/card
    (t2/fragment [:= :card/archived false])

    :metadata/metric
    (t2/fragment [:= :archived false])

    :metadata/segment
    (t2/fragment [:= :segment/archived false])

    :metadata/measure
    (t2/fragment [:= :measure/archived false])

    #_else
    nil))

(mu/defn- metadata-where
  "The `:where` clause picking out the `metadata-type` rows for `database-id`, narrowed by `metadata-spec`'s `:id`,
  `:name`, `:table-ids`, and `:card-ids` (whichever apply to `metadata-type`), or restricted to active/visible
  rows when none of `:id`/`:name` is given (`:include-sensitive?` controlling whether sensitive columns count
  as active). This should match [[metabase.lib.metadata.protocols/default-spec-filter-xform]] as closely as
  possible."
  [metadata-type :- ::lib.metadata.protocols/metadata-type-excluding-database
   database-id   :- ::lib.schema.id/database
   {id-set :id, name-set :name, :keys [table-ids card-ids include-sensitive?]} :- ::lib.metadata.protocols/metadata-spec]
  (let [active-only? (not (or id-set name-set))
        metric?      (= metadata-type :metadata/metric)]
    (t2/fragment
     [:and
      (database-id-clause metadata-type database-id)
      (when id-set (id-clause metadata-type id-set))
      (when name-set (name-clause metadata-type name-set))
      (when table-ids (table-id-clause metadata-type table-ids))
      (when card-ids (card-id-clause metadata-type card-ids))
      (when active-only? (active-only-where metadata-type include-sensitive?))
      (when metric? (t2/fragment [:= :type "metric"]))
      (when (and metric? table-ids) (t2/fragment [:= :source_card_id nil]))])))

(mu/defn tables
  "The `:metadata/table` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/table {:where (metadata-where :metadata/table database-id metadata-spec)}))

(mu/defn columns
  "The `:metadata/column` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/column {:where (metadata-where :metadata/column database-id metadata-spec)}))

(mu/defn cards
  "The `:metadata/card` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/card {:where (metadata-where :metadata/card database-id metadata-spec)}))

(mu/defn metrics
  "The `:metadata/metric` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/metric {:where (metadata-where :metadata/metric database-id metadata-spec)}))

(mu/defn segments
  "The `:metadata/segment` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/segment {:where (metadata-where :metadata/segment database-id metadata-spec)}))

(mu/defn measures
  "The `:metadata/measure` rows for `database-id` picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/measure {:where (metadata-where :metadata/measure database-id metadata-spec)}))

(mu/defn native-query-snippets
  "The `:metadata/native-query-snippet` rows picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/native-query-snippet {:where (metadata-where :metadata/native-query-snippet database-id metadata-spec)}))

(mu/defn transforms
  "The `:metadata/transform` rows picked out by `metadata-spec`."
  [database-id   :- ::lib.schema.id/database
   metadata-spec :- ::lib.metadata.protocols/metadata-spec]
  (t2/select :metadata/transform {:where (metadata-where :metadata/transform database-id metadata-spec)}))
