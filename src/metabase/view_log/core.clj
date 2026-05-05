(ns metabase.view-log.core
  (:require
   [metabase.view-log.events.view-log]
   [metabase.view-log.models.view-log-impl]
   [potemkin :as p]))

(comment
  metabase.view-log.events.view-log/keep-me
  metabase.view-log.models.view-log-impl/keep-me)

(p/import-vars
 [metabase.view-log.events.view-log
  generate-view
  increment-view-counts!
  record-views!]
 [metabase.view-log.models.view-log-impl
  context])
