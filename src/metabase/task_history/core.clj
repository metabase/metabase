(ns metabase.task-history.core
  (:require
   [metabase.task-history.models.task-history]
   [metabase.task-history.models.task-run]
   [potemkin :as p]))

(comment metabase.task-history.models.task-history/keep-me
         metabase.task-history.models.task-run/keep-me)

(p/import-vars
 [metabase.task-history.models.task-history
  with-task-history]
 [metabase.task-history.models.task-run
  *run-id*
  complete-task-run!
  with-restored-run-id
  with-run-id-meta
  with-task-run])
