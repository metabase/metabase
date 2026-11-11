(ns metabase.lib-metric.db
  "Application database queries for the lib metric module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn card-table-and-database-id
  "The `:table_id` and `:database_id` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :table_id :database_id] :id card-id))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn- metric-where
  "The `:where` clause for the metric Cards picked out by `metadata-spec` (its `:id`, `:name`,
  `:table-ids`, and `:card-ids` keys), or unarchived ones when neither `:id` nor `:name` is given."
  [{id-set :id, name-set :name, :keys [table-ids card-ids]}]
  (let [active-only? (not (or id-set name-set))]
    (t2/fragment
     [:and
      [:= :type "metric"]
      (when id-set (t2/fragment [:in :id id-set]))
      (when name-set (t2/fragment [:in :name name-set]))
      (when table-ids (t2/fragment [:in :table_id table-ids]))
      (when table-ids (t2/fragment [:= :source_card_id nil]))
      (when card-ids (t2/fragment [:in :source_card_id card-ids]))
      (when active-only? (t2/fragment [:= :archived false]))])))

(mu/defn metrics
  "The metric Cards (`:metadata/metric`) picked out by `metadata-spec`."
  [metadata-spec :- [:map {:closed true}
                     [:lib/type  {:optional true} [:= :metadata/metric]]
                     [:id        {:optional true} [:maybe [:set ms/PositiveInt]]]
                     [:name      {:optional true} [:maybe [:set :string]]]
                     [:table-ids {:optional true} [:maybe [:set ::lib.schema.id/table]]]
                     [:card-ids  {:optional true} [:maybe [:set ::lib.schema.id/card]]]]]
  (t2/select :metadata/metric {:where (metric-where metadata-spec)}))

(defn- measure-where
  "The `:where` clause for the `:metadata/measure` rows picked out by `metadata-spec` (its `:id`, `:name`, and
  `:table-ids` keys), or unarchived ones when neither `:id` nor `:name` is given."
  [{id-set :id, name-set :name, :keys [table-ids]}]
  (let [active-only? (not (or id-set name-set))]
    (t2/fragment
     [:and
      (when id-set (t2/fragment [:in :measure/id id-set]))
      (when name-set (t2/fragment [:in :measure/name name-set]))
      (when table-ids (t2/fragment [:in :measure/table_id table-ids]))
      (when active-only? (t2/fragment [:= :measure/archived false]))])))

(mu/defn measures
  "The `:metadata/measure` rows picked out by `metadata-spec`."
  [metadata-spec :- [:map {:closed true}
                     [:lib/type  {:optional true} [:= :metadata/measure]]
                     [:id        {:optional true} [:maybe [:set ms/PositiveInt]]]
                     [:name      {:optional true} [:maybe [:set :string]]]
                     [:table-ids {:optional true} [:maybe [:set ::lib.schema.id/table]]]]]
  (t2/select :metadata/measure {:where (measure-where metadata-spec)}))
