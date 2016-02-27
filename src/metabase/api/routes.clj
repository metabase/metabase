(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            (metabase.api [activity :as activity]
                          [card :as card]
                          [dashboard :as dashboard]
                          [database :as database]
                          [dataset :as dataset]
                          [email :as email]
                          [field :as field]
                          [foreignkey :as fk]
                          [metric :as metric]
                          [notify :as notify]
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
                          [util :as util])
            [metabase.middleware :as middleware]))

(def ^:private +apikey
  "Wrap API-ROUTES so they may only be accessed with proper apikey credentials."
  middleware/enforce-api-key)

(def ^:private +auth
  "Wrap API-ROUTES so they may only be accessed with proper authentiaction credentials."
  middleware/enforce-authentication)

(defroutes ^{:doc "Ring routes for API endpoints."} routes
  (context "/activity"     [] (+auth activity/routes))
  (context "/card"         [] (+auth card/routes))
  (context "/dashboard"    [] (+auth dashboard/routes))
  (context "/database"     [] (+auth database/routes))
  (context "/dataset"      [] (+auth dataset/routes))
  (context "/email"        [] (+auth email/routes))
  (context "/field"        [] (+auth field/routes))
  (context "/foreignkey"   [] (+auth fk/routes))
  (GET     "/health"       [] (if ((resolve 'metabase.core/initialized?))
                                {:status 200 :body {:status "ok"}}
                                {:status 503 :body {:status "initializing" :progress ((resolve 'metabase.core/initialization-progress))}}))
  (context "/metric"       [] (+auth metric/routes))
  (context "/notify"       [] (+apikey notify/routes))
  (context "/pulse"        [] (+auth pulse/routes))
  (context "/revision"     [] (+auth revision/routes))
  (context "/segment"      [] (+auth segment/routes))
  (context "/session"      [] session/routes)
  (context "/setting"      [] (+auth setting/routes))
  (context "/setup"        [] setup/routes)
  (context "/slack"        [] (+auth slack/routes))
  (context "/table"        [] (+auth table/routes))
  (context "/tiles"        [] (+auth tiles/routes))
  (context "/user"         [] (+auth user/routes))
  (context "/util"         [] util/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                     {:status 404
                      :body   (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
