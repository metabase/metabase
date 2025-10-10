(ns metabase.lib-be.core
  (:require
   [metabase.lib-be.hash]
   [metabase.lib-be.metadata.bootstrap]
   [metabase.lib-be.metadata.jvm]
   [metabase.lib-be.models.transforms]
   [metabase.lib-be.settings]
   [potemkin :as p]))

(comment
  metabase.lib-be.hash/keep-me
  metabase.lib-be.metadata.bootstrap/keep-me
  metabase.lib-be.metadata.jvm/keep-me
  metabase.lib-be.models.transforms/keep-me
  metabase.lib-be.settings/keep-me)

(p/import-vars
 [metabase.lib-be.hash
  query-hash]
 [metabase.lib-be.metadata.bootstrap
  resolve-database]
 [metabase.lib-be.metadata.jvm
  application-database-metadata-provider
  instance->metadata
  metadata-provider-cache
  with-existing-metadata-provider-cache
  with-metadata-provider-cache]
 [metabase.lib-be.models.transforms
  normalize-query
  transform-query]
 [metabase.lib-be.settings
  breakout-bin-width
  breakout-bins-num
  enable-nested-queries
  start-of-week])
