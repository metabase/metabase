(ns metabase.core.init
  "Loads all OSS namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.channel.init]
   [metabase.config :as config]
   [metabase.driver.init]
   [metabase.events.init]
   [metabase.logger.init]
   [metabase.models.init]
   [metabase.notification.init]
   [metabase.query-analysis.init]
   [metabase.search.init]
   [metabase.sync.init]
   [metabase.task.init]))

;; load EE init code on system launch if it exists.
(when (and (not *compile-files*)
           config/ee-available?)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (require 'metabase-enterprise.core.init))
