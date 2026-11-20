(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.models.collection]
   [metabase.collections.util]
   [metabase.collections.write]
   [potemkin :as p]))

(comment
  metabase.collections.write/keep-me
  metabase.collections.models.collection/keep-me
  metabase.collections.util/keep-me)

(p/import-vars
 [metabase.collections.write
  clear-remote-synced-collection!
  create-collection!
  create-library-collection!
  delete-collection!
  move-collection!
  set-remote-synced!
  update-collection!]
 [metabase.collections.models.collection
  has-remote-synced-collection?
  descendant-ids
  instance-analytics-collection-type
  library-collection
  library-collection-type
  library-collection-types
  library-data-collection-type
  library-metrics-collection-type
  location-path
  location-path->ids
  root-collection-type-by-id
  shared-tenant-collection?
  slugify
  transforms-ns
  trash-collection-id
  data-apps-ns
  data-actions-ns
  default-allowed-namespaces]
 [metabase.collections.util
  annotate-dashboards
  present-collection
  with-effective-ancestors])
