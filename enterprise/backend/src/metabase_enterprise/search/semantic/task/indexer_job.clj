(ns metabase-enterprise.search.semantic.task.indexer-job
  "The semantic search indexer's Quartz job class.

  This is `gen-class` rather than `deftype` so the class keeps a name independent of this namespace, see
  [[metabase-enterprise.search.semantic.task.indexer/job-class]] for why. It is AOT-compiled in the uberjar and
  runtime-compiled in dev. Keep it tiny: all logic lives in [[metabase-enterprise.search.semantic.task.indexer]]."
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
