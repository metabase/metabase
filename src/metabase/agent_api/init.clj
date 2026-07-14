(ns metabase.agent-api.init
  (:require
   [metabase.agent-api.settings]
   [metabase.agent-api.task.cleanup-expired-exports]
   [metabase.agent-api.task.cleanup-expired-query-handles]))

(set! *warn-on-reflection* true)
