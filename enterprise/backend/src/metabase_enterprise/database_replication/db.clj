(ns metabase-enterprise.database-replication.db
  "Application database queries for the database-replication module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))
