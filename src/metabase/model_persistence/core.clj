(ns metabase.model-persistence.core
  (:require
   [metabase.model-persistence.models.persisted-info]
   [metabase.model-persistence.task.persist-refresh]
   [potemkin :as p]))

(comment
  metabase.model-persistence.models.persisted-info/keep-me
  metabase.model-persistence.task.persist-refresh/keep-me)

(p/import-vars
 [metabase.model-persistence.models.persisted-info
  allow-persisted-substitution?
  invalidate!
  mark-for-pruning!
  metadata->definition
  query-hash
  turn-on-model!
  with-persisted-substituion-disabled]
 [metabase.model-persistence.task.persist-refresh
  schedule-refresh-for-individual!])
