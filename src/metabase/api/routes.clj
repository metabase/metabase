(ns metabase.api.routes
  (:require [compojure.core :refer [defroutes context GET]]
            [compojure.route :as route]
            (metabase.api [card :as card]
                          [meta-db :as meta-db]
                          [meta-table :as meta-table]
                          [org :as org]
                          [session :as session]
                          [user :as user])))

;; placeholder until we actually define real API routes
(defroutes routes
  ;; call /api/test to see this
  (GET "/test" [] {:status 200 :body {:message "We can serialize JSON <3"}})
  (context "/card" [] card/routes)
  (context "/meta/db" [] meta-db/routes)
  (context "/meta/table" [] meta-table/routes)
  (context "/org" [] org/routes)
  (context "/session" [] session/routes)
  (context "/user" [] user/routes)
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
