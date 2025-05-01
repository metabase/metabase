(ns metabase.lib-be.init
  (:require
   [metabase.lib-be.settings]
   [metabase.lib-be.task.backfill-card-metadata-analysis]
   [metabase.lib-be.task.backfill-entity-ids]))

;; XXX: START HERE: Figure out how to log COUNT(*) by metadata_analysis_state to Prometheus periodically.
;; How often is the right amount? Should I be logging it after each run? Does it poll these metrics and I just have
;; to report them?
