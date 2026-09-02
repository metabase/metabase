(ns metabase.indexes-rest.queries
  "Application database queries for the indexes REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn table-index
  "The TableIndex with `id`, or nil."
  [id]
  (t2/select-one :model/TableIndex :id id))

(defn insert-table-index!
  "Insert the TableIndex `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/TableIndex row))

(defn set-table-index-structured!
  "Set the `structured` definition of the TableIndex with `id`."
  [id structured]
  (t2/update! :model/TableIndex id {:structured structured}))

(defn set-table-index-status!
  "Set the `status` of the TableIndex with `id`."
  [id status]
  (t2/update! :model/TableIndex id {:status status}))
