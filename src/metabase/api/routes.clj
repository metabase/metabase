(ns metabase.api.routes
  (:require
   [compojure.core :refer [context defroutes]]
   [compojure.route :as route]
   [metabase.api.action :as api.action]
   [metabase.api.activity :as api.activity]
   [metabase.api.alert :as api.alert]
   [metabase.api.automagic-dashboards :as api.magic]
   [metabase.api.bookmark :as api.bookmark]
   [metabase.api.card :as api.card]
   [metabase.api.collection :as api.collection]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.database :as api.database]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.email :as api.email]
   [metabase.api.embed :as api.embed]
   [metabase.api.field :as api.field]
   [metabase.api.geojson :as api.geojson]
   [metabase.api.google :as api.google]
   [metabase.api.ldap :as api.ldap]
   [metabase.api.login-history :as api.login-history]
   [metabase.api.metabot :as api.metabot]
   [metabase.api.metric :as api.metric]
   [metabase.api.native-query-snippet :as api.native-query-snippet]
   [metabase.api.notify :as api.notify]
   [metabase.api.permissions :as api.permissions]
   [metabase.api.persist :as api.persist]
   [metabase.api.premium-features :as api.premium-features]
   [metabase.api.preview-embed :as api.preview-embed]
   [metabase.api.public :as api.public]
   [metabase.api.pulse :as api.pulse]
   [metabase.api.revision :as api.revision]
   [metabase.api.routes.common
    :refer [+apikey +auth +public-exceptions +message-only-exceptions]]
   [metabase.api.search :as api.search]
   [metabase.api.segment :as api.segment]
   [metabase.api.session :as api.session]
   [metabase.api.setting :as api.setting]
   [metabase.api.setup :as api.setup]
   [metabase.api.slack :as api.slack]
   [metabase.api.table :as api.table]
   [metabase.api.task :as api.task]
   [metabase.api.testing :as api.testing]
   [metabase.api.tiles :as api.tiles]
   [metabase.api.timeline :as api.timeline]
   [metabase.api.timeline-event :as api.timeline-event]
   [metabase.api.transform :as api.transform]
   [metabase.api.user :as api.user]
   [metabase.api.util :as api.util]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(u/ignore-exceptions (classloader/require 'metabase-enterprise.api.routes))

;; EE routes defined in [[metabase-enterprise.api.routes/routes]] always get the first chance to handle a request, if
;; they exist. If they don't exist, this handler returns `nil` which means Compojure will try the next handler.
(def ^:private ^{:arglists '([request respond raise])} ee-routes
  ;; resolve the var for every request so we pick up any changes to it in interactive development
  (if-let [ee-handler-var (resolve 'metabase-enterprise.api.routes/routes)]
    (fn [request respond raise]
      ((var-get ee-handler-var) request respond raise))
    (fn [_request respond _raise]
      (respond nil))))

(defroutes ^{:doc "Ring routes for API endpoints."} routes
  ee-routes
  (context "/action"               [] (+auth api.action/routes))
  (context "/activity"             [] (+auth api.activity/routes))
  (context "/alert"                [] (+auth api.alert/routes))
  (context "/automagic-dashboards" [] (+auth api.magic/routes))
  (context "/card"                 [] (+auth api.card/routes))
  (context "/bookmark"             [] (+auth api.bookmark/routes))
  (context "/collection"           [] (+auth api.collection/routes))
  (context "/dashboard"            [] (+auth api.dashboard/routes))
  (context "/database"             [] (+auth api.database/routes))
  (context "/dataset"              [] (+auth api.dataset/routes))
  (context "/email"                [] (+auth api.email/routes))
  (context "/embed"                [] (+message-only-exceptions api.embed/routes))
  (context "/field"                [] (+auth api.field/routes))
  (context "/geojson"              [] api.geojson/routes)
  (context "/google"               [] (+auth api.google/routes))
  (context "/ldap"                 [] (+auth api.ldap/routes))
  (context "/login-history"        [] (+auth api.login-history/routes))
  (context "/premium-features"     [] (+auth api.premium-features/routes))
  (context "/metabot"              [] (+auth api.metabot/routes))
  (context "/metric"               [] (+auth api.metric/routes))
  (context "/native-query-snippet" [] (+auth api.native-query-snippet/routes))
  (context "/notify"               [] (+apikey api.notify/routes))
  (context "/permissions"          [] (+auth api.permissions/routes))
  (context "/persist"              [] (+auth api.persist/routes))
  (context "/preview_embed"        [] (+auth api.preview-embed/routes))
  (context "/public"               [] (+public-exceptions api.public/routes))
  (context "/pulse"                [] (+auth api.pulse/routes))
  (context "/revision"             [] (+auth api.revision/routes))
  (context "/search"               [] (+auth api.search/routes))
  (context "/segment"              [] (+auth api.segment/routes))
  (context "/session"              [] api.session/routes)
  (context "/setting"              [] (+auth api.setting/routes))
  (context "/setup"                [] api.setup/routes)
  (context "/slack"                [] (+auth api.slack/routes))
  (context "/table"                [] (+auth api.table/routes))
  (context "/task"                 [] (+auth api.task/routes))
  (context "/testing"              [] (if (or (not config/is-prod?)
                                              (config/config-bool :mb-enable-test-endpoints))
                                        api.testing/routes
                                        (fn [_ respond _] (respond nil))))
  (context "/tiles"                [] (+auth api.tiles/routes))
  (context "/timeline"             [] (+auth api.timeline/routes))
  (context "/timeline-event"       [] (+auth api.timeline-event/routes))
  (context "/transform"            [] (+auth api.transform/routes))
  (context "/user"                 [] (+auth api.user/routes))
  (context "/util"                 [] api.util/routes)
  (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")})))
