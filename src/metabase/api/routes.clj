(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            (metabase.api [card :as card]
                          [dash :as dash]
                          [notify :as notify]
                          [session :as session]
                          [setting :as setting]
                          [setup :as setup]
                          [tiles :as tiles]
                          [user :as user])
            (metabase.api.meta [dataset :as dataset]
                               [db :as db]
                               [field :as field]
                               [fk :as fk]
                               [table :as table])
            [metabase.middleware.auth :as auth]))

(def ^:private +apikey
  "Wrap API-ROUTES so they may only be accessed with proper apikey credentials."
  auth/enforce-api-key)

(def ^:private +auth
  "Wrap API-ROUTES so they may only be accessed with proper authentiaction credentials."
  auth/enforce-authentication)

(defroutes routes
  (context "/card"         [] (+auth card/routes))
  (context "/dash"         [] (+auth dash/routes))
  (GET     "/health"       [] {:status 200 :body {:status "ok"}})
  (context "/meta/dataset" [] (+auth dataset/routes))
  (context "/meta/db"      [] (+auth db/routes))
  (context "/meta/field"   [] (+auth field/routes))
  (context "/meta/fk"      [] (+auth fk/routes))
  (context "/meta/table"   [] (+auth table/routes))
  (context "/notify"       [] (+apikey notify/routes))
  (context "/session"      [] session/routes)
  (context "/setting"      [] (+auth setting/routes))
  (context "/setup"        [] setup/routes)
  (context "/tiles"        [] (+auth tiles/routes))
  (context "/user"         [] (+auth user/routes))
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
