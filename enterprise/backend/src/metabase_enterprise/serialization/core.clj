(ns metabase-enterprise.serialization.core
  (:require
   [metabase-enterprise.serialization.v2.extract]
   [metabase-enterprise.serialization.v2.ingest]
   [metabase-enterprise.serialization.v2.load]
   [metabase-enterprise.serialization.v2.storage]
   [potemkin :as p]))

(comment
  metabase-enterprise.serialization.v2.extract/keep-me
  metabase-enterprise.serialization.v2.ingest/keep-me
  metabase-enterprise.serialization.v2.load/keep-me
  metabase-enterprise.serialization.v2.storage/keep-me)

(p/import-vars
 [metabase-enterprise.serialization.v2.extract
  extract]
 [metabase-enterprise.serialization.v2.ingest
  strip-labels
  Ingestable
  read-timestamps
  parse-key]
 [metabase-enterprise.serialization.v2.load
  load-metabase!]
 [metabase-enterprise.serialization.v2.storage
  escape-segment])
