(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.models.collection]
   [potemkin :as p]))

(comment
  metabase.collections.models.collection/keep-me)

(p/import-vars
 [metabase.collections.models.collection
  check-for-remote-sync-update
  check-non-remote-synced-dependencies
  check-remote-synced-dependents
  create-library-collection!
  descendant-ids
  library-collection
  library-data-collection-type
  location-path
  moving-from-remote-synced?
  moving-into-remote-synced?
  non-remote-synced-dependencies
  remote-synced-collection
  remote-synced-collection?
  shared-tenant-collection?
  transforms-ns])
