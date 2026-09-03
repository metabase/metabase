(ns metabase.lib-metric.db
  "Application database queries for the lib metric module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [toucan2.core :as t2]))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn card-table-and-database-id
  "The `:table_id` and `:database_id` of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :table_id :database_id] card-id))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table table-id))

(defn- metric-where
  "The `:where` map for the metric Cards picked out by `metadata-spec` (its `:id`, `:name`,
  `:table-ids`, and `:card-ids` keys), or unarchived ones when neither `:id` nor `:name` is given."
  [{id-set :id, name-set :name, :keys [table-ids card-ids]}]
  (let [active-only? (not (or id-set name-set))]
    (reduce sql.helpers/where {}
            (cond-> [[:= :type "metric"]]
              id-set       (conj [:in :id id-set])
              name-set     (conj [:in :name name-set])
              table-ids    (conj [:in :table_id table-ids])
              table-ids    (conj [:= :source_card_id nil])
              card-ids     (conj [:in :source_card_id card-ids])
              active-only? (conj [:= :archived false])))))

(defn metrics
  "The metric Cards (`:metadata/metric`) picked out by `metadata-spec`."
  [metadata-spec]
  (t2/select :metadata/metric (metric-where metadata-spec)))

(defn- measure-where
  "The `:where` map for the `:metadata/measure` rows picked out by `metadata-spec` (its `:id`, `:name`, and
  `:table-ids` keys), or unarchived ones when neither `:id` nor `:name` is given."
  [{id-set :id, name-set :name, :keys [table-ids]}]
  (let [active-only? (not (or id-set name-set))]
    (reduce sql.helpers/where {}
            (cond-> []
              id-set       (conj [:in :measure/id id-set])
              name-set     (conj [:in :measure/name name-set])
              table-ids    (conj [:in :measure/table_id table-ids])
              active-only? (conj [:= :measure/archived false])))))

(defn measures
  "The `:metadata/measure` rows picked out by `metadata-spec`."
  [metadata-spec]
  (t2/select :metadata/measure (measure-where metadata-spec)))
