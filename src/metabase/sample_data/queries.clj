(ns metabase.sample-data.queries
  "Application database queries for the sample data module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn set-sample-database-details!
  "Set the `details` of the sample Database, returning the ids of the updated rows."
  [details]
  (t2/update-returning-pks! :model/Database :is_sample true {:details details}))

(defn insert-sample-database!
  "Insert the sample Database and return the inserted instance."
  [database-name details engine]
  (t2/insert-returning-instance! :model/Database
                                 :name      database-name
                                 :details   details
                                 :engine    engine
                                 :is_sample true))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))

(defn set-database-tables-schema!
  "Set the `schema` of every Table of the Database with `database-id`."
  [database-id schema]
  (t2/update! :model/Table :db_id database-id {:schema schema}))

(defn set-database-table-permissions-schema-name!
  "Set the `schema_name` of the table-level DataPermissions rows of the Database with `database-id`."
  [database-id schema-name]
  ;; Raw table update: the model's before-update rejects all updates.
  (t2/query {:update (t2/table-name :model/DataPermissions)
             :set    {:schema_name schema-name}
             :where  [:and
                      [:= :db_id database-id]
                      [:not= :table_id nil]]}))
