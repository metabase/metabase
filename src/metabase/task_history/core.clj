(ns metabase.task-history.core
  (:require
   [metabase.task-history.models.task-history]
   [potemkin :as p]))

(comment metabase.task-history.models.task-history/keep-me)

(p/import-vars
 [metabase.task-history.models.task-history
  with-task-history])
