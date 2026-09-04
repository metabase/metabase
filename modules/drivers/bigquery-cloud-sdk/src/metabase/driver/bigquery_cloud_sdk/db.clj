(ns metabase.driver.bigquery-cloud-sdk.db
  "Application database queries for the bigquery-cloud-sdk driver. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the driver never talks to `toucan2.core` itself."
  (:require
   ;; the driver persists dataset-filter and project-id migrations of its Database details back to the app DB
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn update-database-details!
  "Set the details of the Database with `database-id`."
  [database-id details]
  (t2/update! :model/Database database-id {:details details}))

(defn set-table-schemas!
  "Set the schema of the Tables of the Database with `database-id` that do not have `schema` yet, overwriting any
  stale schema they already have."
  [database-id schema]
  (t2/query-one {:update (t2/table-name :model/Table)
                 :set    {:schema schema}
                 :where  [:and
                          [:= :db_id database-id]
                          [:or
                           [:= :schema nil]
                           [:not= :schema schema]]]}))

(defn active-partitioned-field-exists?
  "Whether the Table with `table-id` has an active database-partitioned Field named `field-name`."
  [table-id field-name]
  (t2/exists? :model/Field :table_id table-id :name field-name :database_partitioned true :active true))
