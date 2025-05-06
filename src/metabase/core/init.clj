(ns metabase.core.init
  "Loads all namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.activity-feed.init]
   [metabase.cache.init]
   [metabase.channel.init]
   [metabase.cloud-migration.init]
   [metabase.config :as config]
   [metabase.driver.init]
   [metabase.embedding.init]
   [metabase.events.init]
   [metabase.indexed-entities.init]
   [metabase.lib-be.init]
   [metabase.logger.init]
   [metabase.login-history.init]
   [metabase.model-persistence.init]
   [metabase.models.init]
   [metabase.notification.init]
   [metabase.premium-features.init]
   [metabase.public-sharing.init]
   [metabase.pulse.init]
   [metabase.query-analysis.init]
   [metabase.revisions.init]
   [metabase.sample-data.init]
   [metabase.search.init]
   [metabase.session.init]
   [metabase.settings.init]
   [metabase.sso.init]
   [metabase.sync.init]
   [metabase.task-history.init]
   [metabase.task.init]
   [metabase.testing-api.init]
   [metabase.tiles.init]
   [metabase.upload.init]
   [metabase.user-key-value.init]
   [metabase.xrays.init]))

;; load EE init code on system launch if it exists.
(when (and (not *compile-files*)
           config/ee-available?)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (require 'metabase-enterprise.core.init))
