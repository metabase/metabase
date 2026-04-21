(ns metabase-enterprise.semantic-search.init
  (:require
   [metabase-enterprise.semantic-search.settings]
   [metabase-enterprise.semantic-search.task.index-cleanup]
   [metabase-enterprise.semantic-search.task.index-repair]
   [metabase-enterprise.semantic-search.task.indexer]
   [metabase-enterprise.semantic-search.task.metric-collector]
   [metabase-enterprise.semantic-search.task.usage-trimmer]))
