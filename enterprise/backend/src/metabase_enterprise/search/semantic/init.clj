(ns metabase-enterprise.search.semantic.init
  (:require
   [metabase-enterprise.search.semantic.db.store-health]
   [metabase-enterprise.search.semantic.embedding-health]
   [metabase-enterprise.search.semantic.events]
   [metabase-enterprise.search.semantic.health]
   [metabase-enterprise.search.semantic.settings]
   [metabase-enterprise.search.semantic.task.index-cleanup]
   [metabase-enterprise.search.semantic.task.index-repair]
   [metabase-enterprise.search.semantic.task.indexer]
   [metabase-enterprise.search.semantic.task.metric-collector]
   [metabase-enterprise.search.semantic.task.usage-trimmer]))
