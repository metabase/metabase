(ns metabase.remote-sync.core
  "Remote sync: which rows of each model it syncs, and whether they can be written."
  (:require
   [metabase.remote-sync.db :as remote-sync.db]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [metabase.remote-sync.synced :as remote-sync.synced]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [remote-sync.db
  built-in-filter-clause
  synced-fk-clause
  synced-ids-clause]
 [remote-sync.spec
  spec]
 [remote-sync.synced
  can-write-filter-clause
  can-write?
  read-only?
  synced-changes?
  synced-collection-id
  synced-label
  synced-models
  synced-parent])
