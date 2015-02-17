(ns metabase.api.routes
  (:require [compojure.core :refer [context defroutes]]
            [compojure.route :as route]
            (metabase.api [card :as card]
                          [dash :as dash]
                          [org :as org]
                          [query :as query]
                          [session :as session]
                          [user :as user])
            (metabase.api.meta [dataset :as dataset]
                               [db :as db]
                               [table :as table])))

;; placeholder until we actually define real API routes
(defroutes routes
  ;; call /api/test to see this
  (context "/card" [] card/routes)
  (context "/dash" [] dash/routes)
  (context "/meta/dataset" [] dataset/routes)
  (context "/meta/db" [] db/routes)
  (context "/meta/table" [] table/routes)
  (context "/org" [] org/routes)
  (context "/query" [] query/routes)
  (context "/session" [] session/routes)
  (context "/user" [] user/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
