(ns metabase-enterprise.warehouse-schema.table
  "Enterprise implementation of table access via collection permissions."
  (:require
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise can-access-via-collection?
  "Returns true if the user can access this published table via collection read permissions."
  :feature :data-studio
  [table]
  (when (:is_published table)
    (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection table :read))))
