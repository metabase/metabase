(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            (metabase.api [activity :as activity]
                          [card :as card]
                          [dashboard :as dashboard]
                          [database :as database]
                          [dataset :as dataset]
                          [field :as field]
                          [foreignkey :as fk]
                          [notify :as notify]
                          [revision :as revision]
                          [session :as session]
                          [setting :as setting]
                          [setup :as setup]
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

(defroutes routes
  (context "/activity"     [] (+auth activity/routes))
  (context "/card"         [] (+auth card/routes))
  (context "/dashboard"    [] (+auth dashboard/routes))
  (context "/database"     [] (+auth database/routes))
  (context "/dataset"      [] (+auth dataset/routes))
  (context "/field"        [] (+auth field/routes))
  (context "/foreignkey"   [] (+auth fk/routes))
  (GET     "/health"       [] (if ((resolve 'metabase.core/initialized?))
                                  {:status 200 :body {:status "ok"}}
                                  {:status 503 :body {:status "initializing" :progress ((resolve 'metabase.core/initialization-progress))}}))
  (context "/notify"       [] (+apikey notify/routes))
  (context "/revision"     [] (+auth revision/routes))
  (context "/session"      [] session/routes)
  (context "/setting"      [] (+auth setting/routes))
  (context "/setup"        [] setup/routes)
  (context "/table"        [] (+auth table/routes))
  (context "/tiles"        [] (+auth tiles/routes))
  (context "/user"         [] (+auth user/routes))
  (context "/util"         [] util/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                     {:status 404
                      :body   (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
