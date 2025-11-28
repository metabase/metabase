(ns metabase-enterprise.remote-sync.core
  (:require
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(comment
  source/keep-me)

(p/import-vars
 [source]

 [source.p
  ->ingestable])

(defenterprise collection-editable?
  "Determines if a remote-synced collection should be editable.

  Takes a collection to check for editability.

  Returns true if the collection is editable, false otherwise. Returns true when remote-sync-type is :read-write
  or when the collection is not a remote-synced collection. Always returns true on OSS."
  :feature :none
  [collection]
  (or (= (settings/remote-sync-type) :read-write)
      (not (collections/remote-synced-collection? collection))))

(defenterprise tenant-collection-remote-synced?
  "Returns true if the tenant-collections-remote-sync-enabled setting is enabled
   AND the collection is in the shared-tenant-collection namespace."
  :feature :none
  [collection]
  (and (settings/tenant-collections-remote-sync-enabled)
       (collections/is-shared-tenant-collection? collection)))

(defenterprise tenant-collections-remote-sync-enabled?
  "Returns the current value of the tenant-collections-remote-sync-enabled setting."
  :feature :none
  []
  (settings/tenant-collections-remote-sync-enabled))
