(ns metabase-enterprise.serialization.core
  (:require
   [metabase-enterprise.serialization.dump]
   [metabase-enterprise.serialization.v2.extract]
   [metabase-enterprise.serialization.v2.ingest]
   [metabase-enterprise.serialization.v2.load]
   [metabase-enterprise.serialization.v2.storage]
   [potemkin :as p]))

(comment
  metabase-enterprise.serialization.dump/keep-me
  metabase-enterprise.serialization.v2.extract/keep-me
  metabase-enterprise.serialization.v2.ingest/keep-me
  metabase-enterprise.serialization.v2.load/keep-me
  metabase-enterprise.serialization.v2.storage/keep-me)

(p/import-vars
 [metabase-enterprise.serialization.dump
  serialization-deep-sort]
 [metabase-enterprise.serialization.v2.extract
  make-targets-of-type
  extract]
 [metabase-enterprise.serialization.v2.ingest
  strip-labels
  Ingestable
  ingest-yaml
  ingest-list
  ingest-one
  read-timestamps
  parse-key]
 [metabase-enterprise.serialization.v2.load
  load-metabase!]
 [metabase-enterprise.serialization.v2.storage
  store!
  escape-segment])
