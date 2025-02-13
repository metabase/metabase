(ns metabase.api.routes
  (:require
   [compojure.route :as route]
   [metabase.actions.api]
   [metabase.activity-feed.api]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.api.alert]
   [metabase.api.api-key]
   [metabase.api.cache]
   [metabase.api.card]
   [metabase.api.cards]
   [metabase.api.cloud-migration]
   [metabase.api.collection]
   [metabase.api.dashboard]
   [metabase.api.database]
   [metabase.api.dataset]
   [metabase.api.docs]
   [metabase.api.embed]
   [metabase.api.field]
   [metabase.api.geojson]
   [metabase.api.google]
   [metabase.api.ldap]
   [metabase.api.login-history]
   [metabase.api.macros :as api.macros]
   [metabase.api.native-query-snippet]
   [metabase.api.open-api :as open-api]
   [metabase.api.persist]
   [metabase.api.premium-features]
   [metabase.api.preview-embed]
   [metabase.api.public]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.api.pulse]
   [metabase.api.pulse.unsubscribe]
   [metabase.api.routes.common :as routes.common :refer [+static-apikey]]
   [metabase.api.session]
   [metabase.api.setting]
   [metabase.api.slack]
   [metabase.api.table]
   [metabase.api.task]
   [metabase.api.testing]
   [metabase.api.tiles]
   [metabase.api.user]
   [metabase.api.util]
   [metabase.api.util.handlers :as handlers]
   [metabase.bookmarks.api]
   [metabase.channel.api]
   [metabase.config :as config]
   [metabase.indexed-entities.api]
   [metabase.permissions.api]
   [metabase.revisions.api]
   [metabase.search.api]
   [metabase.segments.api]
   [metabase.setup.api]
   [metabase.sync.api]
   [metabase.timeline.api]
   [metabase.user-key-value.api]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.xrays.api]))

(comment metabase.actions.api/keep-me
         metabase.activity-feed.api/keep-me
         metabase.api.alert/keep-me
         metabase.api.api-key/keep-me
         metabase.api.cache/keep-me
         metabase.api.card/keep-me
         metabase.api.cards/keep-me
         metabase.api.cloud-migration/keep-me
         metabase.api.collection/keep-me
         metabase.api.dashboard/keep-me
         metabase.api.database/keep-me
         metabase.api.dataset/keep-me
         metabase.api.embed/keep-me
         metabase.api.field/keep-me
         metabase.api.geojson/keep-me
         metabase.api.google/keep-me
         metabase.api.ldap/keep-me
         metabase.api.login-history/keep-me
         metabase.api.native-query-snippet/keep-me
         metabase.api.persist/keep-me
         metabase.api.preview-embed/keep-me
         metabase.api.public/keep-me
         metabase.api.pulse.unsubscribe/keep-me
         metabase.segments.api/keep-me
         metabase.api.setting/keep-me
         metabase.api.slack/keep-me
         metabase.api.table/keep-me
         metabase.api.task/keep-me
         metabase.api.testing/keep-me
         metabase.api.tiles/keep-me
         metabase.api.user/keep-me
         metabase.api.util/keep-me
         metabase.bookmarks.api/keep-me
         metabase.indexed-entities.api/keep-me
         metabase.permissions.api/keep-me
         metabase.revisions.api/keep-me
         metabase.setup.api/keep-me
         metabase.user-key-value.api/keep-me)

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

(def ^:private enable-testing-routes?
  (or (not config/is-prod?)
      (config/config-bool :mb-enable-test-endpoints)))

(defn- ->handler [x]
  (cond-> x
    (simple-symbol? x) api.macros/ns-handler))

(defn- +auth                    [handler] (routes.common/+auth                    (->handler handler)))
(defn- +message-only-exceptions [handler] (routes.common/+message-only-exceptions (->handler handler)))
(defn- +public-exceptions       [handler] (routes.common/+public-exceptions       (->handler handler)))

(def ^:private ^{:arglists '([request respond raise])} pulse-routes
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.api.pulse.unsubscribe})
   (+auth metabase.api.pulse/routes)))

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!                                                                                                !!
;;; !!                  DO NOT ADD `metabase.api.*` NAMESPACES THAT CONTAIN ENDPOINTS                 !!
;;; !!                                                                                                !!
;;; !!   Please read https://metaboat.slack.com/archives/CKZEMT1MJ/p1738972144181069 for more info    !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private route-map
  {"/action"               (+auth 'metabase.actions.api)
   "/activity"             (+auth 'metabase.activity-feed.api)
   "/alert"                (+auth 'metabase.api.alert)
   "/api-key"              (+auth 'metabase.api.api-key)
   "/automagic-dashboards" (+auth metabase.xrays.api/automagic-dashboards-routes)
   "/bookmark"             (+auth 'metabase.bookmarks.api)
   "/cache"                (+auth 'metabase.api.cache)
   "/card"                 (+auth 'metabase.api.card)
   "/cards"                (+auth 'metabase.api.cards)
   "/channel"              (+auth metabase.channel.api/channel-routes)
   "/cloud-migration"      (+auth 'metabase.api.cloud-migration)
   "/collection"           (+auth 'metabase.api.collection)
   "/dashboard"            (+auth 'metabase.api.dashboard)
   "/database"             (+auth 'metabase.api.database)
   "/dataset"              'metabase.api.dataset
   "/docs"                 metabase.api.docs/routes
   "/email"                metabase.channel.api/email-routes
   "/embed"                (+message-only-exceptions 'metabase.api.embed)
   "/field"                (+auth 'metabase.api.field)
   "/geojson"              'metabase.api.geojson
   "/google"               (+auth 'metabase.api.google)
   "/ldap"                 (+auth 'metabase.api.ldap)
   "/login-history"        (+auth 'metabase.api.login-history)
   "/model-index"          (+auth 'metabase.indexed-entities.api)
   "/native-query-snippet" (+auth 'metabase.api.native-query-snippet)
   "/notify"               (+static-apikey metabase.sync.api/notify-routes)
   "/permissions"          (+auth 'metabase.permissions.api)
   "/persist"              (+auth 'metabase.api.persist)
   "/premium-features"     (+auth metabase.api.premium-features/routes)
   "/preview_embed"        (+auth 'metabase.api.preview-embed)
   "/public"               (+public-exceptions 'metabase.api.public)
   "/pulse"                pulse-routes
   "/revision"             (+auth 'metabase.revisions.api)
   "/search"               (+auth metabase.search.api/routes)
   "/segment"              (+auth 'metabase.segments.api)
   "/session"              metabase.api.session/routes
   "/setting"              (+auth 'metabase.api.setting)
   "/setup"                'metabase.setup.api
   "/slack"                (+auth 'metabase.api.slack)
   "/table"                (+auth 'metabase.api.table)
   "/task"                 (+auth 'metabase.api.task)
   "/testing"              (if enable-testing-routes? 'metabase.api.testing pass-thru-handler)
   "/tiles"                (+auth 'metabase.api.tiles)
   "/timeline"             (+auth metabase.timeline.api/timeline-routes)
   "/timeline-event"       (+auth metabase.timeline.api/timeline-event-routes)
   "/user"                 (+auth 'metabase.api.user)
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
  ;; EE routes defined in [[metabase-enterprise.api.routes/routes]] always get the first chance to handle a request, if
  ;; they exist. If they don't exist, this handler returns `nil` which means we will try the next handler.
  (handlers/routes
   (if (and config/ee-available? (not *compile-files*))
     (requiring-resolve 'metabase-enterprise.api.routes/routes)
     pass-thru-handler)
   (handlers/route-map-handler route-map)
   not-found-handler))
