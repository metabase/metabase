(ns metabase.prototype.db
  "App DB queries for the prototype module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(def database-name
  "Name of the Database that holds the prototype dataset."
  "Prototype Data")

(mu/defn prototype-database
  "The prototype Database, or nil."
  []
  (t2/select-one :model/Database :name database-name :engine :postgres))

(mu/defn prototype-database-id :- [:maybe ::lib.schema.id/database]
  "The id of the prototype Database, or nil."
  []
  (t2/select-one-pk :model/Database :name database-name :engine :postgres))

(mu/defn insert-prototype-database!
  "Insert the prototype Database and return it."
  [details :- ::warehouses.schema/database.details]
  (t2/insert-returning-instance! :model/Database
                                 :name    database-name
                                 :engine  :postgres
                                 :details details))

(mu/defn update-database-details!
  "Set the `details` of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   details     :- ::warehouses.schema/database.details]
  (t2/update! :model/Database database-id {:details details}))

(mu/defn table-ids-by-name :- [:map-of :string ::lib.schema.id/table]
  "Map of table name to id for the tables of the Database with `database-id` in `schema`."
  [database-id :- ::lib.schema.id/database
   schema      :- :string]
  (t2/select-fn->pk :name :model/Table :db_id database-id :schema schema :active true
                    {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn field-ids-by-name :- [:map-of :string ::lib.schema.id/field]
  "Map of field name to id for the top-level fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn->pk :name :model/Field :table_id table-id :parent_id nil
                    {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn set-field-semantic-type!
  "Set the semantic type of the Field with `field-id` as a user value, so that sync does not change it. A nil
  semantic type is a user value too: the Field has no semantic type."
  [field-id      :- ::lib.schema.id/field
   semantic-type :- [:maybe :keyword]]
  (if (t2/exists? :model/FieldUserSettings field-id)
    (t2/update! :model/FieldUserSettings field-id {:semantic_type semantic-type})
    (t2/insert! :model/FieldUserSettings {:field_id field-id, :semantic_type semantic-type})))
