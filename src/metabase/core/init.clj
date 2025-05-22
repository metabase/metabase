(ns metabase.core.init
  "Loads all namespaces that need to be loaded for side effects on system launch. By convention, these
  namespaces should follow the pattern

    metabase.<module-name>.init

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase.actions.init]
   [metabase.activity-feed.init]
   [metabase.analytics.init]
   [metabase.api.init]
   [metabase.app-db.init]
   [metabase.appearance.init]
   [metabase.audit-app.init]
   [metabase.batch-processing.init]
   [metabase.bug-reporting.init]
   [metabase.cache.init]
   [metabase.channel.init]
   [metabase.classloader.init]
   [metabase.cloud-migration.init]
   [metabase.config.core :as config]
   [metabase.content-verification.init]
   [metabase.driver.init]
   [metabase.eid-translation.init]
   [metabase.embedding.init]
   [metabase.events.init]
   [metabase.geojson.init]
   [metabase.indexed-entities.init]
   [metabase.lib-be.init]
   [metabase.logger.init]
   [metabase.login-history.init]
   [metabase.model-persistence.init]
   [metabase.models.init]
   [metabase.notification.init]
   [metabase.parameters.init]
   [metabase.permissions.init]
   [metabase.premium-features.init]
   [metabase.product-feedback.init]
   [metabase.public-sharing.init]
   [metabase.pulse.init]
   [metabase.queries.init]
   [metabase.query-analysis.init]
   [metabase.query-processor.init]
   [metabase.request.init]
   [metabase.revisions.init]
   [metabase.sample-data.init]
   [metabase.search.init]
   [metabase.server.init]
   [metabase.session.init]
   [metabase.settings.init]
   [metabase.setup.init]
   [metabase.sso.init]
   [metabase.sync.init]
   [metabase.system.init]
   [metabase.task-history.init]
   [metabase.testing-api.init]
   [metabase.tiles.init]
   [metabase.types.init]
   [metabase.upload.init]
   [metabase.user-key-value.init]
   [metabase.users.init]
   [metabase.version.init]
   [metabase.view-log.init]
   [metabase.warehouses.init]
   [metabase.xrays.init]))

;; load EE init code on system launch if it exists.
(when (and (not *compile-files*)
           config/ee-available?)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (require 'metabase-enterprise.core.init))
