(ns metabase.api.routes
  (:require
   [compojure.route :as route]
   [metabase.api.routes.common :refer [+auth +message-only-exceptions +public-exceptions +static-apikey]]
   [metabase.api.util.handlers :as handlers]
   [metabase.config :as config]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- pass-thru-handler [_request respond _raise]
  (respond nil))

(def ^:private enable-testing-routes?
  (or (not config/is-prod?)
      (config/config-bool :mb-enable-test-endpoints)))

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private route-map
  {"/action"               (+auth (handlers/lazy-ns-handler 'metabase.api.action))
   "/activity"             (+auth (handlers/lazy-ns-handler 'metabase.api.activity))
   "/alert"                (+auth (handlers/lazy-ns-handler 'metabase.api.alert))
   "/api-key"              (+auth (handlers/lazy-ns-handler 'metabase.api.api-key))
   "/automagic-dashboards" (+auth (handlers/lazy-ns-handler 'metabase.api.automagic-dashboards))
   "/bookmark"             (+auth (handlers/lazy-ns-handler 'metabase.api.bookmark))
   "/cache"                (+auth (handlers/lazy-ns-handler 'metabase.api.cache))
   "/card"                 (+auth (handlers/lazy-ns-handler 'metabase.api.card))
   "/cards"                (+auth (handlers/lazy-ns-handler 'metabase.api.cards))
   "/channel"              (+auth (handlers/lazy-handler 'metabase.channel.api/channel-routes))
   "/cloud-migration"      (+auth (handlers/lazy-ns-handler 'metabase.api.cloud-migration))
   "/collection"           (+auth (handlers/lazy-ns-handler 'metabase.api.collection))
   "/dashboard"            (+auth (handlers/lazy-ns-handler 'metabase.api.dashboard))
   "/database"             (+auth (handlers/lazy-ns-handler 'metabase.api.database))
   "/dataset"              (handlers/lazy-ns-handler 'metabase.api.dataset)
   "/docs"                 (handlers/lazy-handler 'metabase.api.docs/routes)
   "/email"                (+auth (handlers/lazy-handler 'metabase.channel.api/email-routes))
   "/embed"                (+message-only-exceptions (handlers/lazy-ns-handler 'metabase.api.embed))
   "/field"                (+auth (handlers/lazy-ns-handler 'metabase.api.field))
   "/geojson"              (handlers/lazy-ns-handler 'metabase.geojson.api)
   "/google"               (+auth (handlers/lazy-ns-handler 'metabase.api.google))
   "/ldap"                 (+auth (handlers/lazy-ns-handler 'metabase.sso.api.ldap))
   "/login-history"        (+auth (handlers/lazy-ns-handler 'metabase.api.login-history))
   "/model-index"          (+auth (handlers/lazy-ns-handler 'metabase.api.model-index))
   "/native-query-snippet" (+auth (handlers/lazy-ns-handler 'metabase.api.native-query-snippet))
   "/notify"               (+static-apikey (handlers/lazy-handler 'metabase.sync.api/routes))
   "/permissions"          (+auth (handlers/lazy-ns-handler 'metabase.api.permissions))
   "/persist"              (+auth (handlers/lazy-ns-handler 'metabase.api.persist))
   "/premium-features"     (+auth (handlers/lazy-handler 'metabase.api.premium-features/routes))
   "/preview_embed"        (+auth (handlers/lazy-ns-handler 'metabase.api.preview-embed))
   "/public"               (+public-exceptions (handlers/lazy-ns-handler 'metabase.api.public))
   "/pulse"                (handlers/routes
                            (handlers/route-map-handler
                             {"/unsubscribe" (handlers/lazy-ns-handler 'metabase.api.pulse.unsubscribe)})
                            (+auth (handlers/lazy-handler 'metabase.api.pulse/routes)))
   "/revision"             (+auth (handlers/lazy-ns-handler 'metabase.api.revision))
   "/search"               (+auth (handlers/lazy-handler 'metabase.api.search/routes))
   "/segment"              (+auth (handlers/lazy-ns-handler 'metabase.api.segment))
   "/session"              (handlers/lazy-handler 'metabase.session.api/routes)
   "/setting"              (+auth (handlers/lazy-ns-handler 'metabase.api.setting))
   "/setup"                (handlers/lazy-ns-handler 'metabase.setup.api)
   "/slack"                (+auth (handlers/lazy-ns-handler 'metabase.api.slack))
   "/table"                (+auth (handlers/lazy-ns-handler 'metabase.api.table))
   "/task"                 (+auth (handlers/lazy-ns-handler 'metabase.api.task))
   "/testing"              (if enable-testing-routes?
                             (handlers/lazy-ns-handler 'metabase.api.testing)
                             pass-thru-handler)
   "/tiles"                (+auth (handlers/lazy-ns-handler 'metabase.api.tiles))
   "/timeline"             (+auth (handlers/lazy-ns-handler 'metabase.api.timeline))
   "/timeline-event"       (+auth (handlers/lazy-ns-handler 'metabase.api.timeline-event))
   "/user"                 (+auth (handlers/lazy-ns-handler 'metabase.api.user))
   "/user-key-value"       (+auth (handlers/lazy-ns-handler 'metabase.api.user-key-value))
   "/util"                 (handlers/lazy-ns-handler 'metabase.api.util)})
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
