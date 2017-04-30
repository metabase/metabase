(ns metabase.api.routes
  (:require [compojure
             [core :refer [context defroutes]]
             [route :as route]]
            [metabase.api
             [activity :as activity]
             [card :as card]
             [collection :as collection]
             [dashboard :as dashboard]
             [database :as database]
             [dataset :as dataset]
             [email :as email]
             [embed :as embed]
             [field :as field]
             [geojson :as geojson]
             [getting-started :as getting-started]
             [label :as label]
             [metric :as metric]
             [notify :as notify]
             [permissions :as permissions]
             [preview-embed :as preview-embed]
             [public :as public]
             [pulse :as pulse]
             [revision :as revision]
             [segment :as segment]
             [session :as session]
             [setting :as setting]
             [setup :as setup]
             [slack :as slack]
             [table :as table]
             [tiles :as tiles]
             [user :as user]
             [util :as util]]
            [metabase.middleware :as middleware]))

(def ^:private +generic-exceptions
  "Wrap ROUTES so any Exception thrown is just returned as a generic 400, to prevent details from leaking in public endpoints."
  middleware/genericize-exceptions)

(def ^:private +message-only-exceptions
  "Wrap ROUTES so any Exception thrown is just returned as a 400 with only the message from the original Exception (i.e., remove
   the original stacktrace), to prevent details from leaking in public endpoints."
  middleware/message-only-exceptions)

(def ^:private +apikey
  "Wrap ROUTES so they may only be accessed with proper apikey credentials."
  middleware/enforce-api-key)

(def ^:private +auth
  "Wrap ROUTES so they may only be accessed with proper authentiaction credentials."
  middleware/enforce-authentication)

(defroutes ^{:doc "Ring routes for API endpoints."} routes
  (context "/activity"        [] (+auth activity/routes))
  (context "/card"            [] (+auth card/routes))
  (context "/collection"      [] (+auth collection/routes))
  (context "/dashboard"       [] (+auth dashboard/routes))
  (context "/database"        [] (+auth database/routes))
  (context "/dataset"         [] (+auth dataset/routes))
  (context "/email"           [] (+auth email/routes))
  (context "/embed"           [] (+message-only-exceptions embed/routes))
  (context "/field"           [] (+auth field/routes))
  (context "/getting_started" [] (+auth getting-started/routes))
  (context "/geojson"         [] (+auth geojson/routes))
  (context "/label"           [] (+auth label/routes))
  (context "/metric"          [] (+auth metric/routes))
  (context "/notify"          [] (+apikey notify/routes))
  (context "/permissions"     [] (+auth permissions/routes))
  (context "/preview_embed"   [] (+auth preview-embed/routes))
  (context "/public"          [] (+generic-exceptions public/routes))
  (context "/pulse"           [] (+auth pulse/routes))
  (context "/revision"        [] (+auth revision/routes))
  (context "/segment"         [] (+auth segment/routes))
  (context "/session"         [] session/routes)
  (context "/setting"         [] (+auth setting/routes))
  (context "/setup"           [] setup/routes)
  (context "/slack"           [] (+auth slack/routes))
  (context "/table"           [] (+auth table/routes))
  (context "/tiles"           [] (+auth tiles/routes))
  (context "/user"            [] (+auth user/routes))
  (context "/util"            [] util/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                     {:status 404
                      :body   (str (.toUpperCase (name request-method)) " " uri " does not exist.")})))
