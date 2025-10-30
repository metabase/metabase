(ns metabase-enterprise.remote-sync.init
  (:require
   [metabase-enterprise.remote-sync.events]
   [metabase-enterprise.remote-sync.task.import]
   [metabase-enterprise.remote-sync.task.table-cleanup]))

(set! *warn-on-reflection* true)
