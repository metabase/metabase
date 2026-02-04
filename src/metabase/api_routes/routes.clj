(ns metabase.api-routes.routes
  (:require
   [compojure.route :as route]
   [metabase.actions-rest.api]
   [metabase.activity-feed.api]
   [metabase.analytics.api]
   [metabase.api-keys.api]
   [metabase.api.docs]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :as routes.common :refer [+static-apikey]]
   [metabase.api.util]
   [metabase.api.util.handlers :as handlers]
   [metabase.bookmarks.api]
   [metabase.bug-reporting.api]
   [metabase.cache.api]
   [metabase.channel.api]
   [metabase.cloud-migration.api]
   [metabase.collections-rest.api]
   [metabase.comments.api]
   [metabase.config.core :as config]
   [metabase.dashboards-rest.api]
   [metabase.documents.api]
   [metabase.eid-translation.api]
   [metabase.embedding-rest.api]
   [metabase.geojson.api]
   [metabase.glossary.api]
   [metabase.indexed-entities.api]
   [metabase.llm.api]
   [metabase.logger.api]
   [metabase.login-history.api]
   [metabase.measures.api]
   [metabase.model-persistence.api]
   [metabase.native-query-snippets.api]
   [metabase.notification.api]
   [metabase.permissions-rest.api]
   [metabase.premium-features.api]
   [metabase.product-feedback.api]
   [metabase.public-sharing-rest.api]
   [metabase.pulse.api]
   [metabase.queries-rest.api]
   [metabase.query-processor.api]
   [metabase.revisions.api]
   [metabase.search.api]
   [metabase.segments.api]
   [metabase.session.api]
   [metabase.settings-rest.api]
   [metabase.setup-rest.api]
   [metabase.sso.api]
   [metabase.sync.api]
   [metabase.task-history.api]
   [metabase.testing-api.api]
   [metabase.testing-api.core]
   [metabase.tiles.api]
   [metabase.timeline.api]
   [metabase.upload.api]
   [metabase.user-key-value.api]
   [metabase.users-rest.api]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.warehouse-schema-rest.api]
   [metabase.warehouses-rest.api]
   [metabase.xrays.api]))

(comment metabase.actions-rest.api/keep-me
         metabase.activity-feed.api/keep-me
         metabase.analytics.api/keep-me
         metabase.api-keys.api/keep-me
         metabase.api.util/keep-me
         metabase.bookmarks.api/keep-me
         metabase.bug-reporting.api/keep-me
         metabase.cache.api/keep-me
         metabase.cloud-migration.api/keep-me
         metabase.comments.api/keep-me
         metabase.collections-rest.api/keep-me
         metabase.dashboards-rest.api/keep-me
         metabase.documents.api/keep-me
         metabase.eid-translation.api/keep-me
         metabase.geojson.api/keep-me
         metabase.glossary.api/keep-me
         metabase.indexed-entities.api/keep-me
         metabase.logger.api/keep-me
         metabase.login-history.api/keep-me
         metabase.measures.api/keep-me
         metabase.model-persistence.api/keep-me
         metabase.native-query-snippets.api/keep-me
         metabase.permissions-rest.api/keep-me
         metabase.product-feedback.api/keep-me
         metabase.public-sharing-rest.api/keep-me
         metabase.query-processor.api/keep-me
         metabase.revisions.api/keep-me
         metabase.segments.api/keep-me
         metabase.settings-rest.api/keep-me
         metabase.setup-rest.api/keep-me
         metabase.task-history.api/keep-me
         metabase.testing-api.api/keep-me
         metabase.tiles.api/keep-me
         metabase.upload.api/keep-me
         metabase.user-key-value.api/keep-me
         metabase.users-rest.api/keep-me
         metabase.warehouses-rest.api/keep-me)

(def ^:private ^{:arglists '([request respond raise])} pass-thru-handler
  "Always 'falls thru' to the next handler."
  (open-api/handler-with-open-api-spec
   (fn [_request respond _raise]
     (respond nil))
   ;; no OpenAPI spec for this handler.
   (fn [_prefix]
     nil)))

(def ^:private ^{:arglists '([request respond raise])} not-found-handler
  "Always returns a 404."
  (open-api/handler-with-open-api-spec
   (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")}))
   ;; no OpenAPI spec for this handler.
   (fn [_prefix]
     nil)))

(defn- ->handler [x]
  (cond-> x
    (simple-symbol? x) api.macros/ns-handler))

(defn- +auth                    [handler] (routes.common/+auth                    (->handler handler)))
(defn- +message-only-exceptions [handler] (routes.common/+message-only-exceptions (->handler handler)))
(defn- +public-exceptions       [handler] (routes.common/+public-exceptions       (->handler handler)))

(declare routes)

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!                                                                                                !!
;;; !!                  DO NOT ADD `metabase.api.*` NAMESPACES THAT CONTAIN ENDPOINTS                 !!
;;; !!                                                                                                !!
;;; !!   Please read https://metaboat.slack.com/archives/CKZEMT1MJ/p1738972144181069 for more info    !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private route-map
  {"/action"               (+auth 'metabase.actions-rest.api)
   "/activity"             (+auth 'metabase.activity-feed.api)
   "/alert"                (+auth metabase.pulse.api/alert-routes)
   "/analytics"            (+auth 'metabase.analytics.api)
   "/api-key"              (+auth 'metabase.api-keys.api)
   "/automagic-dashboards" (+auth metabase.xrays.api/automagic-dashboards-routes)
   "/bookmark"             (+auth 'metabase.bookmarks.api)
   "/bug-reporting"        (+auth 'metabase.bug-reporting.api)
   "/cache"                (+auth 'metabase.cache.api)
   "/card"                 (+auth metabase.queries-rest.api/card-routes)
   "/cards"                (+auth metabase.queries-rest.api/cards-routes)
   "/channel"              (+auth metabase.channel.api/channel-routes)
   "/cloud-migration"      (+auth 'metabase.cloud-migration.api)
   "/collection"           (+auth 'metabase.collections-rest.api)
   "/comment"              (+auth metabase.comments.api/routes)
   "/dashboard"            (+auth 'metabase.dashboards-rest.api)
   "/database"             (+auth 'metabase.warehouses-rest.api)
   "/dataset"              (+auth 'metabase.query-processor.api)
   "/docs"                 (metabase.api.docs/make-routes #'routes)
   "/document"             (+auth metabase.documents.api/routes)
   "/eid-translation"      'metabase.eid-translation.api
   "/email"                metabase.channel.api/email-routes
   "/embed"                (+message-only-exceptions metabase.embedding-rest.api/embedding-routes)
   "/field"                (+auth metabase.warehouse-schema-rest.api/field-routes)
   "/geojson"              'metabase.geojson.api
   "/glossary"             (+auth 'metabase.glossary.api)
   "/google"               (+auth metabase.sso.api/google-auth-routes)
   "/ldap"                 (+auth metabase.sso.api/ldap-routes)
   "/llm"                  (+auth metabase.llm.api/routes)
   "/logger"               (+auth 'metabase.logger.api)
   "/login-history"        (+auth 'metabase.login-history.api)
   "/measure"              (+auth 'metabase.measures.api)
   "/model-index"          (+auth 'metabase.indexed-entities.api)
   "/native-query-snippet" (+auth 'metabase.native-query-snippets.api)
   "/notification"         metabase.notification.api/notification-routes
   "/notify"               (+static-apikey metabase.sync.api/notify-routes)
   "/permissions"          (+auth 'metabase.permissions-rest.api)
   "/persist"              (+auth 'metabase.model-persistence.api)
   "/premium-features"     (+auth metabase.premium-features.api/routes)
   "/preview_embed"        (+auth metabase.embedding-rest.api/preview-embedding-routes)
   "/product-feedback"     'metabase.product-feedback.api
   "/public"               (+public-exceptions 'metabase.public-sharing-rest.api)
   "/pulse"                metabase.pulse.api/pulse-routes
   "/revision"             (+auth 'metabase.revisions.api)
   "/search"               (+auth metabase.search.api/routes)
   "/segment"              (+auth 'metabase.segments.api)
   "/session"              metabase.session.api/routes
   "/setting"              (+auth 'metabase.settings-rest.api)
   "/setup"                'metabase.setup-rest.api
   "/slack"                (+auth metabase.channel.api/slack-routes)
   "/table"                (+auth metabase.warehouse-schema-rest.api/table-routes)
   "/task"                 (+auth 'metabase.task-history.api)
   "/testing"              (if metabase.testing-api.core/enable-testing-routes? 'metabase.testing-api.api pass-thru-handler)
   "/tiles"                (+auth 'metabase.tiles.api)
   "/timeline"             (+auth metabase.timeline.api/timeline-routes)
   "/timeline-event"       (+auth metabase.timeline.api/timeline-event-routes)
   "/upload"               (+auth 'metabase.upload.api)
   "/user"                 (+auth 'metabase.users-rest.api)
   "/user-key-value"       (+auth 'metabase.user-key-value.api)
   "/util"                 'metabase.api.util})
;;; ↑↑↑ KEEP THIS SORTED OR ELSE ↑↑↑

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!                                                                                                !!
;;; !!                  DO NOT ADD `metabase.api.*` NAMESPACES THAT CONTAIN ENDPOINTS                 !!
;;; !!                                                                                                !!
;;; !!   Please read https://metaboat.slack.com/archives/CKZEMT1MJ/p1738972144181069 for more info    !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for API endpoints."
  ;; EE routes defined in [[metabase-enterprise.api-routes.routes/routes]] always get the first chance to handle a
  ;; request, if they exist. If they don't exist, this handler returns `nil` which means we will try the next handler.
  (handlers/routes
   (if (and config/ee-available? (not *compile-files*))
     (requiring-resolve 'metabase-enterprise.api-routes.routes/routes)
     pass-thru-handler)
   (handlers/route-map-handler route-map)
   (if (and config/dev-available? (not *compile-files*))
     (requiring-resolve 'dev.api.routes/routes)
     pass-thru-handler)
   not-found-handler))
