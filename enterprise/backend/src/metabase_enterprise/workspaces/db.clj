(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::table-spec
  [:map {:closed true}
   [:db     {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]
   [:table  :string]])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-engine
  "The `:engine` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

;;; ---------------------------------------------- TableRemapping ----------------------------------------------

(mu/defn table-remappings
  "Every TableRemapping, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(mu/defn table-remappings-exist?
  "Whether the Database with `database-id` has a TableRemapping."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/TableRemapping :database_id database-id))

(mu/defn table-remappings-of-database
  "The TableRemappings of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/TableRemapping :database_id database-id))

(mu/defn table-remapping
  "The TableRemapping of the Database with `database-id` whose source is `from-spec`, or nil."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec]
  (t2/select-one :model/TableRemapping
                 :database_id     database-id
                 :from_db         (:db from-spec)
                 :from_schema     (:schema from-spec)
                 :from_table_name (:table from-spec)))

(mu/defn upsert-table-remapping!
  "Insert a TableRemapping from `from-spec` to `to-spec` unless one from `from-spec` already exists. Idempotent on the
  unique constraint `(database_id, from_db, from_schema, from_table_name)`: [[app-db/update-or-insert!]] retries the
  lookup when a concurrent insert wins the race."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec
   to-spec     :- ::table-spec]
  (app-db/update-or-insert!
   :model/TableRemapping
   {:database_id     database-id
    :from_db         (:db from-spec)
    :from_schema     (:schema from-spec)
    :from_table_name (:table from-spec)}
   (fn [existing]
     (when-not existing
       {:to_db         (:db to-spec)
        :to_schema     (:schema to-spec)
        :to_table_name (:table to-spec)}))))

(mu/defn delete-table-remapping!
  "Delete the TableRemapping of the Database with `database-id` whose source is `from-spec`. Returns the number of
  rows deleted."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec]
  (t2/delete! :model/TableRemapping
              :database_id     database-id
              :from_db         (:db from-spec)
              :from_schema     (:schema from-spec)
              :from_table_name (:table from-spec)))

(mu/defn delete-table-remappings-of-database!
  "Delete the TableRemappings of the Database with `database-id`. Returns the number of rows deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/TableRemapping :database_id database-id))

(mu/defn delete-table-remappings-into!
  "Delete the TableRemappings of the Database with `database-id` whose target is in the `(to-db, to-schema)`
  namespace. Returns the number of rows deleted."
  [database-id :- ::lib.schema.id/database
   to-db       :- :string
   to-schema   :- :string]
  (t2/delete! :model/TableRemapping :database_id database-id :to_db to-db :to_schema to-schema))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping."
  []
  (t2/delete! :model/TableRemapping))
