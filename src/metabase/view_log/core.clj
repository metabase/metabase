(ns metabase.view-log.core
  (:require
   [metabase.view-log.models.view-log-impl]
   [potemkin :as p]))

(comment metabase.view-log.models.view-log-impl/keep-me)

(p/import-vars
 [metabase.view-log.models.view-log-impl
  context])
