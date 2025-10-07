(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.models.collection]
   [potemkin :as p]))

(comment
  metabase.collections.models.collection/keep-me)

(p/import-vars
 [metabase.collections.models.collection
  remote-synced-collection?
  check-for-remote-sync-update
  check-non-remote-synced-dependencies
  check-remote-synced-dependents
  moving-into-remote-synced?
  moving-from-remote-synced?
  non-remote-synced-dependencies])
