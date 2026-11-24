(ns metabase.task-history.init
  (:require
   [metabase.task-history.models.task-history]
   [metabase.task-history.models.task-run]
   [metabase.task-history.task.task-history-cleanup]
   [metabase.task-history.task.task-run-heartbeat]))
