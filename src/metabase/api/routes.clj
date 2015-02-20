(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes]]
            [compojure.route :as route]
            (metabase.api [annotation :as annotation]
                          [card :as card]
                          [dash :as dash]
                          [org :as org]
                          [qs :as qs]
                          [query :as query]
                          [result :as result]
                          [search :as search]
                          [session :as session]
                          [user :as user])
            (metabase.api.meta [dataset :as dataset]
                               [db :as db]
                               [field :as field]
                               [table :as table])))

;; placeholder until we actually define real API routes
(defroutes routes
  ;; call /api/test to see this
  (context "/annotation"   [] annotation/routes)
  (context "/card"         [] card/routes)
  (context "/dash"         [] dash/routes)
  (context "/meta/dataset" [] dataset/routes)
  (context "/meta/db"      [] db/routes)
  (context "/meta/field"   [] field/routes)
  (context "/meta/table"   [] table/routes)
  (context "/org"          [] org/routes)
  (context "/qs"           [] qs/routes)
  (context "/query"        [] query/routes)
  (context "/result"       [] result/routes)
  (context "/search"       [] search/routes)
  (context "/session"      [] session/routes)
  (context "/user"         [] user/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
