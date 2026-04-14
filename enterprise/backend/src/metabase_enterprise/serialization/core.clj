(ns metabase-enterprise.serialization.core
  (:require
   [metabase-enterprise.serialization.dump]
   [metabase-enterprise.serialization.v2.extract]
   [metabase-enterprise.serialization.v2.ingest]
   [metabase-enterprise.serialization.v2.load]
   [metabase-enterprise.serialization.v2.storage]
   [metabase-enterprise.serialization.v2.storage.util]
   [potemkin :as p]))

(comment
  metabase-enterprise.serialization.dump/keep-me
  metabase-enterprise.serialization.v2.extract/keep-me
  metabase-enterprise.serialization.v2.ingest/keep-me
  metabase-enterprise.serialization.v2.load/keep-me
  metabase-enterprise.serialization.v2.storage/keep-me
  metabase-enterprise.serialization.v2.storage.util/keep-me)

(p/import-vars
 [metabase-enterprise.serialization.dump
  serialization-deep-sort]
 [metabase-enterprise.serialization.v2.extract
  make-targets-of-type
  extract]
 [metabase-enterprise.serialization.v2.ingest
  legal-top-level-paths
  strip-labels
  Ingestable
  ingest-yaml
  ingest-list
  ingest-one
  ingest-errors
  read-timestamps
  parse-key]
 [metabase-enterprise.serialization.v2.load
  load-metabase!]
 [metabase-enterprise.serialization.v2.storage
  store!]
 [metabase-enterprise.serialization.v2.storage.util
  resolve-storage-path
  slugify-name])
