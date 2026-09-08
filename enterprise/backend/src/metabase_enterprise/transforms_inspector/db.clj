(ns metabase-enterprise.transforms-inspector.db
  "Application database queries for the transforms-inspector module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn table-source-rows :- [:sequential [:map {:closed true}
                                            [:table-id   ms/PositiveInt]
                                            [:table-name :string]
                                            [:schema     [:maybe :string]]
                                            [:db-id      ms/PositiveInt]]]
  "The ID, name, schema, and Database ID of the Tables with `table-ids`, as source info."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table [:id :table-id] [:name :table-name] :schema [:db_id :db-id]] :id [:in table-ids]))

(mu/defn database-engine :- [:maybe :keyword]
  "The engine of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn active-fields-for-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :active true))
