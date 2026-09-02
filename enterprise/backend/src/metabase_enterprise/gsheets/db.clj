(ns metabase-enterprise.gsheets.db
  "Application database queries for the gsheets module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn attached-dwh-database-id
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-fn :id :model/Database :is_attached_dwh true))

(defn attached-dwh-database
  "The attached data warehouse Database, or nil."
  []
  (t2/select-one :model/Database :is_attached_dwh true))

(defn setting-row
  "The Setting row with `setting-key`, or nil."
  [setting-key]
  (t2/select-one :model/Setting :key setting-key))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))
