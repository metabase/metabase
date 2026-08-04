(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.create]
   [metabase.collections.models.collection]
   [metabase.collections.util]
   [potemkin :as p]))

(comment
  metabase.collections.create/keep-me
  metabase.collections.models.collection/keep-me
  metabase.collections.util/keep-me)

(p/import-vars
 [metabase.collections.create
  create-collection!]
 [metabase.collections.models.collection
  has-remote-synced-collection?
  check-for-remote-sync-update
  check-non-remote-synced-dependencies
  check-remote-synced-dependents
  create-library-collection!
  descendant-ids
  library-collection
  library-collection-type
  library-data-collection-type
  library-metrics-collection-type
  location-path
  moving-from-remote-synced?
  moving-into-remote-synced?
  non-remote-synced-dependencies
  remote-synced-collection
  remote-synced-collection?
  root-collection-id
  shared-tenant-collection?
  snippets-ns
  snippets-root-collection-id
  transforms-ns
  transforms-root-collection-id]
 [metabase.collections.util
  annotate-dashboards])
