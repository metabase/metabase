(ns metabase.indexes-rest.db
  "Application database queries for the indexes REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.indexes.schema :as indexes.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database database-id))

(mu/defn table-index :- [:maybe ::indexes.schema/table-index]
  "The TableIndex with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id))

(mu/defn insert-table-index! :- (mut/optional-keys ::indexes.schema/table-index)
  "Insert the TableIndex `row` and return the inserted instance."
  [row :- ::indexes.schema/table-index.update]
  (t2/insert-returning-instance! :model/TableIndex row))

(mu/defn set-table-index-structured! :- :int
  "Set the `structured` definition of the TableIndex with `id`."
  [id         :- ms/PositiveInt
   structured :- [:maybe :map]]
  (t2/update! :model/TableIndex id {:structured structured}))

(mu/defn set-table-index-status! :- :int
  "Set the `status` of the TableIndex with `id`."
  [id     :- ms/PositiveInt
   status :- [:or :keyword :string]]
  (t2/update! :model/TableIndex id {:status status}))
