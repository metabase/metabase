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
   [metabase.api.permissions]
   [metabase.api.persist]
   [metabase.api.premium-features]
   [metabase.api.preview-embed]
   [metabase.api.public]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.api.pulse]
   [metabase.api.revision]
   [metabase.api.routes.common :refer [+auth +message-only-exceptions +public-exceptions +static-apikey]]
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
         metabase.api.permissions/keep-me
         metabase.api.persist/keep-me
         metabase.api.preview-embed/keep-me
         metabase.api.public/keep-me
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
         metabase.setup.api/keep-me)

(defn- pass-thru-handler [_request respond _raise]
  (respond nil))

(def ^:private enable-testing-routes?
  (or (not config/is-prod?)
      (config/config-bool :mb-enable-test-endpoints)))

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private route-map
  {"/action"               (+auth (api.macros/ns-handler 'metabase.api.action))
   "/activity"             (+auth (api.macros/ns-handler 'metabase.api.activity))
   "/alert"                (+auth (api.macros/ns-handler 'metabase.api.alert))
   "/api-key"              (+auth (api.macros/ns-handler 'metabase.api.api-key))
   "/automagic-dashboards" (+auth (api.macros/ns-handler 'metabase.api.automagic-dashboards))
   "/bookmark"             (+auth (api.macros/ns-handler 'metabase.api.bookmark))
   "/cache"                (+auth (api.macros/ns-handler 'metabase.api.cache))
   "/card"                 (+auth (api.macros/ns-handler 'metabase.api.card))
   "/cards"                (+auth (api.macros/ns-handler 'metabase.api.cards))
   "/channel"              (+auth metabase.channel.api/channel-routes)
   "/cloud-migration"      (+auth (api.macros/ns-handler 'metabase.api.cloud-migration))
   "/collection"           (+auth (api.macros/ns-handler 'metabase.api.collection))
   "/dashboard"            (+auth (api.macros/ns-handler 'metabase.api.dashboard))
   "/database"             (+auth (api.macros/ns-handler 'metabase.api.database))
   "/dataset"              (api.macros/ns-handler 'metabase.api.dataset)
   "/docs"                 metabase.api.docs/routes
   "/email"                metabase.channel.api/email-routes
   "/embed"                (+message-only-exceptions (api.macros/ns-handler 'metabase.api.embed))
   "/field"                (+auth (api.macros/ns-handler 'metabase.api.field))
   "/geojson"              (api.macros/ns-handler 'metabase.api.geojson)
   "/google"               (+auth (api.macros/ns-handler 'metabase.api.google))
   "/ldap"                 (+auth (api.macros/ns-handler 'metabase.api.ldap))
   "/login-history"        (+auth (api.macros/ns-handler 'metabase.api.login-history))
   "/model-index"          (+auth (api.macros/ns-handler 'metabase.api.model-index))
   "/native-query-snippet" (+auth (api.macros/ns-handler 'metabase.api.native-query-snippet))
   "/notify"               (+static-apikey metabase.sync.api/routes)
   "/permissions"          (+auth (api.macros/ns-handler 'metabase.api.permissions))
   "/persist"              (+auth (api.macros/ns-handler 'metabase.api.persist))
   "/premium-features"     (+auth metabase.api.premium-features/routes)
   "/preview_embed"        (+auth (api.macros/ns-handler 'metabase.api.preview-embed))
   "/public"               (+public-exceptions (api.macros/ns-handler 'metabase.api.public))
   "/pulse"                (handlers/routes
                            (handlers/route-map-handler
                             {"/unsubscribe" (api.macros/ns-handler 'metabase.api.pulse.unsubscribe)})
                            (+auth metabase.api.pulse/routes))
   "/revision"             (+auth (api.macros/ns-handler 'metabase.api.revision))
   "/search"               (+auth metabase.api.search/routes)
   "/segment"              (+auth (api.macros/ns-handler 'metabase.api.segment))
   "/session"              metabase.api.session/routes
   "/setting"              (+auth (api.macros/ns-handler 'metabase.api.setting))
   "/setup"                (api.macros/ns-handler 'metabase.setup.api)
   "/slack"                (+auth (api.macros/ns-handler 'metabase.api.slack))
   "/table"                (+auth (api.macros/ns-handler 'metabase.api.table))
   "/task"                 (+auth (api.macros/ns-handler 'metabase.api.task))
   "/testing"              (if enable-testing-routes?
                             (api.macros/ns-handler 'metabase.api.testing)
                             pass-thru-handler)
   "/tiles"                (+auth (api.macros/ns-handler 'metabase.api.tiles))
   "/timeline"             (+auth (api.macros/ns-handler 'metabase.api.timeline))
   "/timeline-event"       (+auth (api.macros/ns-handler 'metabase.api.timeline-event))
   "/user"                 (+auth (api.macros/ns-handler 'metabase.api.user))
   "/user-key-value"       (+auth (api.macros/ns-handler 'metabase.api.user-key-value))
   "/util"                 (api.macros/ns-handler 'metabase.api.util)})
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
   (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")}))))
