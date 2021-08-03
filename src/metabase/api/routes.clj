(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes]]
            [compojure.route :as route]
            [metabase.api.activity :as activity]
            [metabase.api.alert :as alert]
            [metabase.api.automagic-dashboards :as magic]
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
            [metabase.api.metastore :as metastore]
            [metabase.api.metric :as metric]
            [metabase.api.moderation-review :as moderation-review]
            [metabase.api.native-query-snippet :as native-query-snippet]
            [metabase.api.notify :as notify]
            [metabase.api.permissions :as permissions]
            [metabase.api.preview-embed :as preview-embed]
            [metabase.api.public :as public]
            [metabase.api.pulse :as pulse]
            [metabase.api.revision :as revision]
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
            [metabase.api.transform :as transform]
            [metabase.api.user :as user]
            [metabase.api.util :as util]
            [metabase.config :as config]
            [metabase.plugins.classloader :as classloader]
            [metabase.server.middleware.auth :as middleware.auth]
            [metabase.server.middleware.exceptions :as middleware.exceptions]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru]]))

(u/ignore-exceptions (classloader/require '[metabase-enterprise.sandbox.api.routes :as ee.sandbox.routes]))

(def ^:private +generic-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a generic 400, to prevent details from leaking in public
  endpoints."
  middleware.exceptions/genericize-exceptions)

(def ^:private +message-only-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  middleware.exceptions/message-only-exceptions)

(def ^:private +apikey
  "Wrap `routes` so they may only be accessed with a correct API key header."
  middleware.auth/enforce-api-key)

(def ^:private +auth
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  middleware.auth/enforce-authentication)

(defroutes ^{:doc "Ring routes for API endpoints."} routes
  (or (some-> (resolve 'ee.sandbox.routes/routes) var-get)
      (fn [_ respond _]
        (respond nil)))
  (context "/activity"             [] (+auth activity/routes))
  (context "/alert"                [] (+auth alert/routes))
  (context "/automagic-dashboards" [] (+auth magic/routes))
  (context "/card"                 [] (+auth card/routes))
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
  (context "/metastore"            [] (+auth metastore/routes))
  (context "/metric"               [] (+auth metric/routes))
  (context "/moderation-review"    [] (+auth moderation-review/routes))
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
  (context "/transform"            [] (+auth transform/routes))
  (context "/user"                 [] (+auth user/routes))
  (context "/util"                 [] util/routes)
  (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")})))
