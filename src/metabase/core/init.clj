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
   [metabase.auth-identity.init]
   [metabase.batch-processing.init]
   [metabase.bug-reporting.init]
   [metabase.cache.init]
   [metabase.channel.init]
   [metabase.classloader.init]
   [metabase.cloud-migration.init]
   [metabase.collections-rest.init]
   [metabase.comments.init]
   [metabase.config.core :as config]
   [metabase.content-verification.init]
   [metabase.dashboards.init]
   [metabase.documents.init]
   [metabase.driver.init]
   [metabase.eid-translation.init]
   [metabase.embedding.init]
   [metabase.events.init]
   [metabase.flargs.init :as flargs.init]
   [metabase.geojson.init]
   [metabase.indexed-entities.init]
   [metabase.lib-be.init]
   [metabase.lib.init]
   [metabase.llm.init]
   [metabase.logger.init]
   [metabase.login-history.init]
   [metabase.metabot.init]
   [metabase.model-persistence.init]
   [metabase.models.init]
   [metabase.notification.init]
   [metabase.oauth-server.init]
   [metabase.parameters.init]
   [metabase.permissions.init]
   [metabase.premium-features.init]
   [metabase.product-feedback.init]
   [metabase.public-sharing.init]
   [metabase.pulse.init]
   [metabase.queries.init]
   [metabase.query-processor.init]
   [metabase.remote-sync.init]
   [metabase.request.init]
   [metabase.revisions.init]
   [metabase.sample-data.init]
   [metabase.search.init]
   [metabase.server.init]
   [metabase.session.init]
   [metabase.settings.init]
   [metabase.setup.init]
   [metabase.slackbot.init]
   [metabase.sql-tools.init]
   [metabase.sso.init]
   [metabase.store-api.init]
   [metabase.sync.init]
   [metabase.system.init]
   [metabase.task-history.init]
   [metabase.testing-api.init]
   [metabase.tiles.init]
   [metabase.tracing.init]
   [metabase.transforms-base.init]
   [metabase.transforms.init]
   [metabase.types.init]
   [metabase.upload.init]
   [metabase.user-key-value.init]
   [metabase.users.init]
   [metabase.version.init]
   [metabase.view-log.init]
   [metabase.warehouses.init]
   [metabase.xrays.init]))

;; Activate flargs BEFORE any EE init code runs and before anything user-facing happens. By the
;; time control reaches this form, the module-level `:require`s above have already loaded their
;; side-effectful init namespaces (classloader, logger, drivers, multimethods, etc.), so the
;; shared classloader is ready and log output can be produced. Loading a flarg init ns causes its
;; `defflarg` forms to register impls against `metabase.flargs.core/registry`; registrations
;; purely update atoms, so later dispatcher calls will see them regardless of ordering between
;; siblings. The ONE ordering constraint we care about — impls registered before any seam fn is
;; invoked — is satisfied because `metabase.core.core/init!*` (which actually calls the
;; application startup flow) runs strictly AFTER this namespace has finished loading.
;;
;; If RF_* env vars are misconfigured (flarg requested but not on the classpath), `activate!`
;; throws — per FLARG-PROGRESS.md §Decisions (Approach A), that's the desired loud failure.
(when-not *compile-files*
  (flargs.init/activate!))

;; load EE init code on system launch if it exists.
(when (and (not *compile-files*)
           config/ee-available?)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (require 'metabase-enterprise.core.init))
