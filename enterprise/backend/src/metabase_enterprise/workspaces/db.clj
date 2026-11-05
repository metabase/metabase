(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic."
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::remapping-source
  "The columns that key a TableRemapping: a main table in a database."
  [:map {:closed true}
   [:database_id     ::lib.schema.id/database]
   [:from_db         :string]
   [:from_schema     :string]
   [:from_table_name :string]])

(mr/def ::remapping-target
  "The columns that name the scratch table of a TableRemapping."
  [:map {:closed true}
   [:to_db         :string]
   [:to_schema     :string]
   [:to_table_name :string]])

(mu/defn table-remappings :- [:sequential :map]
  "Every TableRemapping, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(mu/defn table-remappings-of-database :- [:sequential :map]
  "The TableRemappings of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/TableRemapping :database_id [:auto/param database-id]))

(mu/defn upsert-table-remapping!
  "Make the TableRemapping keyed by `source` (its `:database_id`, `:from_db`, `:from_schema` and `:from_table_name`)
  point at `target` (its `:to_db`, `:to_schema` and `:to_table_name`), inserting it when there is none."
  [source :- ::remapping-source
   target :- ::remapping-target]
  (mdb/update-or-insert! :model/TableRemapping source (constantly target)))

(mu/defn delete-table-remapping!
  "Delete the TableRemapping of the main table `from-schema`.`from-table` in the Database with `database-id`, returning
  the number deleted."
  [database-id :- ::lib.schema.id/database
   from-schema :- :string
   from-table  :- :string]
  (t2/delete! :model/TableRemapping
              :database_id     [:auto/param database-id]
              :from_db         ""
              :from_schema     [:auto/param from-schema]
              :from_table_name [:auto/param from-table]))

(mu/defn delete-table-remappings!
  "Delete the TableRemappings with `ids`, returning the number deleted."
  [ids :- [:set :int]]
  (t2/delete! :model/TableRemapping :id [:in ids]))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping, returning the number deleted."
  []
  (t2/delete! :model/TableRemapping))

(mu/defn database-ids-named :- [:maybe [:sequential ::lib.schema.id/database]]
  "The ids of the Databases named `database-name`, ordered by id."
  [database-name :- :string]
  (t2/select-pks-vec :model/Database :name [:auto/param database-name] {:order-by [[:id :asc]]}))

(mu/defn databases-named :- [:sequential :map]
  "The Databases named any of `database-names`."
  [database-names :- [:sequential :string]]
  (if (seq database-names)
    (t2/select :model/Database :name [:in database-names])
    []))

(mu/defn database-name-and-engine :- [:maybe [:map [:name :string] [:engine :keyword]]]
  "The `:name` and `:engine` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one [:model/Database :name :engine] :id [:auto/param database-id]))

(mu/defn active-table :- [:maybe :map]
  "The active Table `schema`.`table-name` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table
                 :db_id  [:auto/param database-id]
                 :schema schema
                 :name   [:auto/param table-name]
                 :active true))

(mu/defn deactivate-table!
  "Mark the Table with `table-id` inactive."
  [table-id :- ::lib.schema.id/table]
  (t2/update! :model/Table :id [:auto/param table-id] {:active false}))
