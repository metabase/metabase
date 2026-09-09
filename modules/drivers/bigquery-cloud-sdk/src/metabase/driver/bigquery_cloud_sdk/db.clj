(ns metabase.driver.bigquery-cloud-sdk.db
  "Application database queries for the bigquery-cloud-sdk driver. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the driver never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   ;; the driver persists dataset-filter and project-id migrations of its Database details back to the app DB
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(mu/defn update-database-details!
  "Set the details of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   details     :- :map]
  (t2/update! :model/Database database-id {:details details}))

(mu/defn set-table-schemas!
  "Set the schema of the Tables of the Database with `database-id` that do not have `schema` yet, overwriting any
  stale schema they already have, returning the number updated."
  [database-id :- ::lib.schema.id/database
   schema      :- :string]
  (t2/query-one {:update (t2/table-name :model/Table)
                 :set    {:schema schema}
                 :where  [:and
                          [:= :db_id database-id]
                          [:or
                           [:= :schema nil]
                           [:not= :schema schema]]]}))

(mu/defn active-partitioned-field-exists?
  "Whether the Table with `table-id` has an active database-partitioned Field named `field-name`."
  [table-id   :- ::lib.schema.id/table
   field-name :- :string]
  (t2/exists? :model/Field :table_id table-id :name field-name :database_partitioned true :active true))
