(ns metabase.sample-data.db
  "Application database queries for the sample data module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(mu/defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id [:auto/param database-id]))

(mu/defn set-database-table-permissions-schema-name!
  "Set the `schema_name` of the table-level DataPermissions rows of the Database with `database-id`, via a raw table
  update because the model's before-update rejects all updates."
  [database-id :- ::lib.schema.id/database
   schema-name :- [:maybe :string]]
  (t2/query {:update (t2/table-name :model/DataPermissions)
             :set    {:schema_name schema-name}
             :where  [:and
                      [:= :db_id database-id]
                      [:not= :table_id nil]]}))
