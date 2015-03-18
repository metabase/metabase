(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            (metabase.api [annotation :as annotation]
                          [card :as card]
                          [dash :as dash]
                          [emailreport :as emailreport]
                          [org :as org]
                          [qs :as qs]
                          [query :as query]
                          [result :as result]
                          [search :as search]
                          [session :as session]
                          [setting :as setting]
                          [setup :as setup]
                          [user :as user])
            (metabase.api.meta [dataset :as dataset]
                               [db :as db]
                               [field :as field]
                               [table :as table])
            [metabase.middleware.auth :as auth]))

(defn- +auth
  "Wrap API-ROUTES so they may only be accessed with proper authentiaction credentials."
  [api-routes]
  (-> api-routes
      auth/bind-current-user
      auth/enforce-authentication))

(defroutes routes
  (context "/annotation"   [] (+auth annotation/routes))
  (context "/card"         [] (+auth card/routes))
  (context "/dash"         [] (+auth dash/routes))
  (context "/emailreport"  [] (+auth emailreport/routes))
  (GET     "/health"       [] {:status 200 :body {:status "ok"}})
  (context "/meta/dataset" [] (+auth dataset/routes))
  (context "/meta/db"      [] (+auth db/routes))
  (context "/meta/field"   [] (+auth field/routes))
  (context "/meta/table"   [] (+auth table/routes))
  (context "/org"          [] (+auth org/routes))
  (context "/qs"           [] (+auth qs/routes))
  (context "/query"        [] (+auth query/routes))
  (context "/result"       [] (+auth result/routes))
  (context "/search"       [] (+auth search/routes))
  (context "/session"      [] session/routes)
  (context "/setting"      [] (+auth setting/routes))
  (context "/setup"        [] setup/routes)
  (context "/user"         [] (+auth user/routes))
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
