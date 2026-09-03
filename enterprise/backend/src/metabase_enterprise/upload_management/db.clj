(ns metabase-enterprise.upload-management.db
  "Application database queries for the upload-management module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn attached-dwh-database-id
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-fn :id :model/Database :is_attached_dwh true))

(defn non-upload-tables-for-database
  "The active Tables of the Database with `database-id` that were not uploaded."
  [database-id]
  (t2/select :model/Table :db_id database-id :active true :is_upload false))

(defn upload-tables
  "The active uploaded Tables, ordered by name."
  []
  (t2/select :model/Table :active true :is_upload true {:order-by [[:name :asc]]}))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table table-id))
