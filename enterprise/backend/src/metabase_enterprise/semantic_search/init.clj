(ns metabase-enterprise.semantic-search.init
  (:require
   [metabase-enterprise.semantic-search.settings]
   [metabase-enterprise.semantic-search.task.index-cleanup :as semantic.task.index-cleanup]
   [metabase-enterprise.semantic-search.task.index-repair :as semantic.task.index-repair]
   [metabase-enterprise.semantic-search.task.indexer :as semantic.task.indexer]
   [metabase-enterprise.semantic-search.task.metric-collector :as semantic.task.metric-collector]
   [metabase-enterprise.semantic-search.task.usage-trimmer :as semantic.task.usage-trimmer]))

(defn ensure-runtime-tasks-started!
  []
  (semantic.task.indexer/ensure-scheduled!)
  (semantic.task.index-repair/ensure-scheduled!)
  (semantic.task.index-cleanup/ensure-scheduled!)
  (semantic.task.metric-collector/ensure-scheduled!)
  (semantic.task.usage-trimmer/ensure-scheduled!))

(defn trigger-indexer-now!
  []
  (semantic.task.indexer/trigger-now!))
