(ns metabase.api.routes
  (:require
   [compojure.route :as route]
   [metabase.api.routes.common :as routes.common :refer [+static-apikey]]
   [metabase.api.util.handlers :as handlers]
   [metabase.config :as config]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- pass-thru-handler [_request respond _raise]
  (respond nil))

(def ^:private enable-testing-routes?
  (or (not config/is-prod?)
      (config/config-bool :mb-enable-test-endpoints)))

(defn- ->handler [x]
  (cond-> x
    (simple-symbol? x)    handlers/lazy-ns-handler
    (qualified-symbol? x) handlers/lazy-handler))

(defn- +auth                    [handler] (routes.common/+auth                    (->handler handler)))
(defn- +message-only-exceptions [handler] (routes.common/+message-only-exceptions (->handler handler)))
(defn- +public-exceptions       [handler] (routes.common/+public-exceptions       (->handler handler)))

(def ^:private ^{:arglists '([request respond raise])} pulse-routes
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.api.pulse.unsubscribe})
   (+auth 'metabase.api.pulse/routes)))

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private route-map
  {"/action"               (+auth 'metabase.api.action)
   "/activity"             (+auth 'metabase.api.activity)
   "/alert"                (+auth 'metabase.api.alert)
   "/api-key"              (+auth 'metabase.api.api-key)
   "/automagic-dashboards" (+auth 'metabase.api.automagic-dashboards)
   "/bookmark"             (+auth 'metabase.api.bookmark)
   "/cache"                (+auth 'metabase.api.cache)
   "/card"                 (+auth 'metabase.api.card)
   "/cards"                (+auth 'metabase.api.cards)
   "/channel"              (+auth 'metabase.channel.api/channel-routes)
   "/cloud-migration"      (+auth 'metabase.api.cloud-migration)
   "/collection"           (+auth 'metabase.api.collection)
   "/dashboard"            (+auth 'metabase.api.dashboard)
   "/database"             (+auth 'metabase.api.database)
   "/dataset"              'metabase.api.dataset
   "/docs"                 'metabase.api.docs/routes
   "/email"                'metabase.channel.api/email-routes
   "/embed"                (+message-only-exceptions 'metabase.api.embed)
   "/field"                (+auth 'metabase.api.field)
   "/geojson"              'metabase.api.geojson
   "/google"               (+auth 'metabase.api.google)
   "/ldap"                 (+auth 'metabase.api.ldap)
   "/login-history"        (+auth 'metabase.api.login-history)
   "/model-index"          (+auth 'metabase.api.model-index)
   "/native-query-snippet" (+auth 'metabase.api.native-query-snippet)
   "/notify"               (+static-apikey 'metabase.sync.api/routes)
   "/permissions"          (+auth 'metabase.api.permissions)
   "/persist"              (+auth 'metabase.api.persist)
   "/premium-features"     (+auth 'metabase.api.premium-features/routes)
   "/preview_embed"        (+auth 'metabase.api.preview-embed)
   "/public"               (+public-exceptions 'metabase.api.public)
   "/pulse"                pulse-routes
   "/revision"             (+auth 'metabase.api.revision)
   "/search"               (+auth 'metabase.api.search/routes)
   "/segment"              (+auth 'metabase.api.segment)
   "/session"              'metabase.api.session/routes
   "/setting"              (+auth 'metabase.api.setting)
   "/setup"                'metabase.setup.api
   "/slack"                (+auth 'metabase.api.slack)
   "/table"                (+auth 'metabase.api.table)
   "/task"                 (+auth 'metabase.api.task)
   "/testing"              (if enable-testing-routes? 'metabase.api.testing pass-thru-handler)
   "/tiles"                (+auth 'metabase.api.tiles)
   "/timeline"             (+auth 'metabase.api.timeline)
   "/timeline-event"       (+auth 'metabase.api.timeline-event)
   "/user"                 (+auth 'metabase.api.user)
   "/user-key-value"       (+auth 'metabase.api.user-key-value)
   "/util"                 'metabase.api.util})
;;; ↑↑↑ KEEP THIS SORTED OR ELSE ↑↑↑

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for API endpoints."
  ;; EE routes defined in [[metabase-enterprise.api.routes/routes]] always get the first chance to handle a request, if
  ;; they exist. If they don't exist, this handler returns `nil` which means we will try the next handler.
  (handlers/routes
   (if config/ee-available?
     (handlers/lazy-handler 'metabase-enterprise.api.routes/routes)
     pass-thru-handler)
   (handlers/route-map-handler route-map)
   (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")}))))
