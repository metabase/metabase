(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes]]
            [compojure.route :as route]
            [metabase.api.activity :as activity]
            [metabase.api.alert :as alert]
            [metabase.api.automagic-dashboards :as magic]
            [metabase.api.bookmark :as bookmark]
            [metabase.api.card :as card]
            [metabase.api.collection :as collection]
            [metabase.api.dashboard :as dashboard]
            [metabase.api.database :as database]
            [metabase.api.dataset :as dataset]
            [metabase.api.email :as email]
            [metabase.api.embed :as embed]
            [metabase.api.field :as field]
            [metabase.api.geojson :as geojson]
            [metabase.api.ldap :as ldap]
            [metabase.api.login-history :as login-history]
            [metabase.api.metric :as metric]
            [metabase.api.native-query-snippet :as native-query-snippet]
            [metabase.api.notify :as notify]
            [metabase.api.permissions :as permissions]
            [metabase.api.premium-features :as premium-features]
            [metabase.api.preview-embed :as preview-embed]
            [metabase.api.public :as public]
            [metabase.api.pulse :as pulse]
            [metabase.api.revision :as revision]
            [metabase.api.routes.common :refer [+apikey +auth +generic-exceptions +message-only-exceptions]]
            [metabase.api.search :as search]
            [metabase.api.segment :as segment]
            [metabase.api.session :as session]
            [metabase.api.setting :as setting]
            [metabase.api.setup :as setup]
            [metabase.api.slack :as slack]
            [metabase.api.table :as table]
            [metabase.api.task :as task]
            [metabase.api.testing :as testing]
            [metabase.api.tiles :as tiles]
            [metabase.api.timeline :as timeline]
            [metabase.api.timeline-event :as timeline-event]
            [metabase.api.transform :as transform]
            [metabase.api.user :as user]
            [metabase.api.util :as util]
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
  (context "/activity"             [] (+auth activity/routes))
  (context "/alert"                [] (+auth alert/routes))
  (context "/automagic-dashboards" [] (+auth magic/routes))
  (context "/card"                 [] (+auth card/routes))
  (context "/bookmark"             [] (+auth bookmark/routes))
  (context "/collection"           [] (+auth collection/routes))
  (context "/dashboard"            [] (+auth dashboard/routes))
  (context "/database"             [] (+auth database/routes))
  (context "/dataset"              [] (+auth dataset/routes))
  (context "/email"                [] (+auth email/routes))
  (context "/embed"                [] (+message-only-exceptions embed/routes))
  (context "/field"                [] (+auth field/routes))
  (context "/geojson"              [] geojson/routes)
  (context "/ldap"                 [] (+auth ldap/routes))
  (context "/login-history"        [] (+auth login-history/routes))
  (context "/premium-features"     [] (+auth premium-features/routes))
  (context "/metric"               [] (+auth metric/routes))
  (context "/native-query-snippet" [] (+auth native-query-snippet/routes))
  (context "/notify"               [] (+apikey notify/routes))
  (context "/permissions"          [] (+auth permissions/routes))
  (context "/preview_embed"        [] (+auth preview-embed/routes))
  (context "/public"               [] (+generic-exceptions public/routes))
  (context "/pulse"                [] (+auth pulse/routes))
  (context "/revision"             [] (+auth revision/routes))
  (context "/search"               [] (+auth search/routes))
  (context "/segment"              [] (+auth segment/routes))
  (context "/session"              [] session/routes)
  (context "/setting"              [] (+auth setting/routes))
  (context "/setup"                [] setup/routes)
  (context "/slack"                [] (+auth slack/routes))
  (context "/table"                [] (+auth table/routes))
  (context "/task"                 [] (+auth task/routes))
  (context "/testing"              [] (if (or (not config/is-prod?)
                                              (config/config-bool :mb-enable-test-endpoints))
                                        testing/routes
                                        (fn [_ respond _] (respond nil))))
  (context "/tiles"                [] (+auth tiles/routes))
  (context "/timeline"             [] (+auth timeline/routes))
  (context "/timeline-event"       [] (+auth timeline-event/routes))
  (context "/transform"            [] (+auth transform/routes))
  (context "/user"                 [] (+auth user/routes))
  (context "/util"                 [] util/routes)
  (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")})))
