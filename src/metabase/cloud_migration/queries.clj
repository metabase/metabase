(ns metabase.cloud-migration.queries
  "Application database queries for the cloud migration module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn cloud-migration-not-in-states
  "A CloudMigration whose state is not one of `states`, or nil."
  [states]
  (t2/select-one :model/CloudMigration :state [:not-in states]))

(defn insert-cloud-migration!
  "Insert the CloudMigration `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/CloudMigration row))

(defn latest-cloud-migration
  "The most recently created CloudMigration, or nil."
  []
  (t2/select-one :model/CloudMigration {:order-by [[:created_at :desc]]}))

(defn cancel-cloud-migrations-not-in-states!
  "Cancel every CloudMigration whose state is not one of `states`."
  [states]
  (t2/update! :model/CloudMigration {:state [:not-in states]} {:state :cancelled}))

(defn row-count
  "The number of rows in `table`."
  [table]
  (t2/count table))

(defn set-cloud-migration-progress-if-not-in-states!
  "Set the state and progress of the CloudMigration with `id` unless its state is one of `states`, returning the
  number of rows updated."
  [id states state progress]
  (t2/update! :model/CloudMigration :id id :state [:not-in states] {:state state :progress progress}))

(defn set-cloud-migration-state!
  "Set the state of the CloudMigration with `id`."
  [id state]
  (t2/update! :model/CloudMigration :id id {:state state}))
