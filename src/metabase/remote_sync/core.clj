(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise collection-editable?
  "Returns if remote-synced collections are editable. Takes a collection to check for eligability.

  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_collection]
  true)

(defenterprise tenant-collection-remote-synced?
  "Returns true if the tenant-collections-remote-sync-enabled setting is enabled
   AND the collection is in the shared-tenant-collection namespace.
   Always returns false on OSS."
  metabase-enterprise.remote-sync.core
  [_collection]
  false)

(defenterprise tenant-collections-remote-sync-enabled?
  "Returns the current value of the tenant-collections-remote-sync-enabled setting.
   Always returns false on OSS."
  metabase-enterprise.remote-sync.core
  []
  false)
