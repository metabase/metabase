(ns metabase.analytics.init
  (:require
   [metabase.analytics.impl]            ; this registers the reporter
   [metabase.analytics.settings]
   [metabase.analytics.task.send-anonymous-stats]))
