(ns metabase.core.init
  "Loads all namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.activity-feed.init]
   [metabase.channel.init]
   [metabase.cloud-migration.init]
   [metabase.config :as config]
   [metabase.driver.init]
   [metabase.events.init]
   [metabase.indexed-entities.init]
   [metabase.logger.init]
   [metabase.login-history.init]
   [metabase.model-persistence.init]
   [metabase.models.init]
   [metabase.notification.init]
   [metabase.public-sharing.init]
   [metabase.pulse.init]
   [metabase.query-analysis.init]
   [metabase.revisions.init]
   [metabase.search.init]
   [metabase.session.init]
   [metabase.sso.init]
   [metabase.sync.init]
   [metabase.task.init]
   [metabase.tiles.init]
   [metabase.user-key-value.init]))

;; load EE init code on system launch if it exists.
(when (and (not *compile-files*)
           config/ee-available?)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (require 'metabase-enterprise.core.init))
