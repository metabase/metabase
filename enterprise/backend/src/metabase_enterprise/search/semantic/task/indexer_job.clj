(ns metabase-enterprise.search.semantic.task.indexer-job
  "The semantic search indexer's Quartz job class.
  Its name is pinned, see [[metabase-enterprise.search.semantic.task.indexer/job-class-name]].
  All logic lives in [[metabase-enterprise.search.semantic.task.indexer]], so keep this namespace tiny."
  (:gen-class :name ^{org.quartz.DisallowConcurrentExecution true}
              metabase_enterprise.semantic_search.task.indexer.SemanticSearchIndexer
              :implements [org.quartz.InterruptableJob])
  (:require
   [metabase-enterprise.search.semantic.task.indexer :as task.indexer]))

(set! *warn-on-reflection* true)

(defn -execute
  "Runs the indexer for a time; Quartz reschedules it to continue."
  [_this _context]
  (task.indexer/execute!))

(defn -interrupt
  "Interrupts the running indexer, if any."
  [_this]
  (task.indexer/interrupt!))
