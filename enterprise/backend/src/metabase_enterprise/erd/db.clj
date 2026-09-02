(ns metabase-enterprise.erd.db
  "Application database queries for the erd module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2]))

(defn tables-where
  "The `columns` of the Tables matching the Honey SQL `where`."
  [columns where]
  (t2/select :model/Table {:select columns, :where where}))

(defn active-fields-for-tables
  "The active Fields of the Tables with `table-ids`, in field order."
  [table-ids]
  (t2/select :model/Field {:where    [:and
                                      [:in :table_id table-ids]
                                      [:= :active true]]
                           :order-by schema.table/field-order-rule}))

(defn active-fields
  "The active Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field {:where [:and
                                   [:in :id field-ids]
                                   [:= :active true]]}))

(defn hydrate-owner
  "Hydrate `:owner` onto `tables`."
  [tables]
  (t2/hydrate tables :owner))
