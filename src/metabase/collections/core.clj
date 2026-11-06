(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.create]
   [metabase.collections.models.collection]
   [metabase.collections.update]
   [metabase.collections.util]
   [potemkin :as p]))

(comment
  metabase.collections.create/keep-me
  metabase.collections.models.collection/keep-me
  metabase.collections.update/keep-me
  metabase.collections.util/keep-me)

(p/import-vars
 [metabase.collections.create
  create-collection!]
 [metabase.collections.update
  update-collection!]
 [metabase.collections.models.collection
  archive-or-unarchive-collection!
  has-remote-synced-collection?
  check-for-remote-sync-update
  check-non-remote-synced-dependencies
  check-remote-synced-dependents
  create-library-collection!
  ensure-library-dashboards-collection!
  descendant-ids
  instance-analytics-collection-type
  library-collection
  library-collection-type
  library-collection-types
  library-dashboards-collection-type
  library-dashboards-collection?
  library-data-collection-type
  library-metrics-collection-type
  location-path
  location-path->ids
  moving-from-remote-synced?
  moving-into-remote-synced?
  remote-synced-collection
  remote-synced-collection?
  root-collection-type-by-id
  shared-tenant-collection?
  slugify
  transforms-ns
  trash-collection-id
  data-apps-ns
  data-actions-ns
  default-allowed-namespaces]
 [metabase.collections.util
  annotate-dashboards])
