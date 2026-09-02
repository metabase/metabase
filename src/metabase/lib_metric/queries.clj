(ns metabase.lib-metric.queries
  "Application database queries for the lib metric module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
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

(defn metrics
  "The `:metadata/metric` rows selected by the Honey SQL `query`."
  [query]
  (t2/select :metadata/metric query))

(defn measures
  "The `:metadata/measure` rows selected by the Honey SQL `query`."
  [query]
  (t2/select :metadata/measure query))
