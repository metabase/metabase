(ns metabase.api.routes
  (:require
   [compojure.route :as route]
   [metabase.api.action]
   [metabase.api.activity]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.api.alert]
   [metabase.api.api-key]
   [metabase.api.automagic-dashboards]
   [metabase.api.bookmark]
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
   [metabase.api.model-index]
   [metabase.api.native-query-snippet]
   [metabase.api.open-api :as open-api]
   [metabase.api.persist]
   [metabase.api.premium-features]
   [metabase.api.preview-embed]
   [metabase.api.public]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.api.pulse]
   [metabase.api.pulse.unsubscribe]
   [metabase.api.revision]
   [metabase.api.routes.common :as routes.common :refer [+static-apikey]]
   [metabase.api.search]
   [metabase.api.segment]
   [metabase.api.session]
   [metabase.api.setting]
   [metabase.api.slack]
   [metabase.api.table]
   [metabase.api.task]
   [metabase.api.testing]
   [metabase.api.tiles]
   [metabase.api.timeline]
   [metabase.api.timeline-event]
   [metabase.api.user]
   [metabase.api.user-key-value]
   [metabase.api.util]
   [metabase.api.util.handlers :as handlers]
   [metabase.channel.api]
   [metabase.config :as config]
   [metabase.permissions.api]
   [metabase.setup.api]
   [metabase.sync.api]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase.api.action/keep-me
         metabase.api.activity/keep-me
         metabase.api.alert/keep-me
         metabase.api.api-key/keep-me
         metabase.api.automagic-dashboards/keep-me
         metabase.api.bookmark/keep-me
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
         metabase.api.model-index/keep-me
         metabase.api.native-query-snippet/keep-me
         metabase.api.persist/keep-me
         metabase.api.preview-embed/keep-me
         metabase.api.public/keep-me
         metabase.api.pulse.unsubscribe/keep-me
         metabase.api.revision/keep-me
         metabase.api.segment/keep-me
         metabase.api.setting/keep-me
         metabase.api.slack/keep-me
         metabase.api.table/keep-me
         metabase.api.task/keep-me
         metabase.api.testing/keep-me
         metabase.api.tiles/keep-me
         metabase.api.timeline/keep-me
         metabase.api.timeline-event/keep-me
         metabase.api.user/keep-me
         metabase.api.user-key-value/keep-me
         metabase.api.util/keep-me
         metabase.permissions.api/keep-me
         metabase.setup.api/keep-me)

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
   "/model-index"          (+auth 'metabase.api.model-index)
   "/native-query-snippet" (+auth 'metabase.api.native-query-snippet)
   "/notify"               (+static-apikey metabase.sync.api/notify-routes)
   "/permissions"          (+auth 'metabase.permissions.api)
   "/persist"              (+auth 'metabase.api.persist)
   "/premium-features"     (+auth metabase.api.premium-features/routes)
   "/preview_embed"        (+auth 'metabase.api.preview-embed)
   "/public"               (+public-exceptions 'metabase.api.public)
   "/pulse"                pulse-routes
   "/revision"             (+auth 'metabase.api.revision)
   "/search"               (+auth metabase.api.search/routes)
   "/segment"              (+auth 'metabase.api.segment)
   "/session"              metabase.api.session/routes
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
   (if (and config/ee-available? (not *compile-files*))
     (requiring-resolve 'metabase-enterprise.api.routes/routes)
     pass-thru-handler)
   (handlers/route-map-handler route-map)
   not-found-handler))
