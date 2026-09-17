(ns metabase.sample-data.db
  "Application database queries for the sample data module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn set-database-tables-schema!
  "Set the `schema` of every Table of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/update! :model/Table :db_id database-id {:schema schema}))

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
