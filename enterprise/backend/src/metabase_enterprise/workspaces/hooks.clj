(ns metabase-enterprise.workspaces.hooks
  "Implements the hooks of `metabase.workspaces.hooks`: the remap rows that point at the old workspace schema of a
  Database go when an update changes it."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.write-batch :as write-batch]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise before-update
  "Delete the remap rows of `row` of `model` once the batch of writes ends when the update changes its
  `database-workspace-schema`."
  :feature :none
  [model row]
  (when (and (= model :model/Database) (contains? (t2/changes row) :settings))
    (let [previous (t2/original row)]
      (write-batch/mark! [::database (:id row)]
                         (constantly nil)
                         (fn [_] (ws/delete-stale-table-remappings! previous row))))))
