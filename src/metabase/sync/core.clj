(ns metabase.sync.core
  "API namespace for the `sync` module. Sync is in charge of taking a connected Database and recording metadata about it
  -- Tables and Fields."
  (:require
   [metabase.sync.analyze]
   [metabase.sync.concurrent]
   [metabase.sync.field-values]
   [metabase.sync.sync]
   [metabase.sync.sync-metadata]
   [metabase.sync.sync-metadata.fields]
   [metabase.sync.sync-metadata.tables]
   [potemkin :as p]))

(comment
  metabase.sync.analyze/keep-me
  metabase.sync.concurrent/keep-me
  metabase.sync.field-values/keep-me
  metabase.sync.sync/keep-me
  metabase.sync.sync-metadata/keep-me
  metabase.sync.sync-metadata.fields/keep-me
  metabase.sync.sync-metadata.tables/keep-me)

(p/import-vars
 [metabase.sync.analyze
  analyze-db!]
 [metabase.sync.concurrent
  submit-task!]
 [metabase.sync.field-values
  update-field-values!
  update-field-values-for-table!]
 [metabase.sync.sync
  refingerprint-field!
  sync-database!
  sync-table!]
 [metabase.sync.sync-metadata
  sync-db-metadata!]
 [metabase.sync.sync-metadata.fields
  sync-fields-for-table!]
 [metabase.sync.sync-metadata.tables
  create-table!])
