(ns metabase.api.routes
  (:require [compojure.core :refer [defroutes GET]]
            [compojure.route :as route]
            (metabase.api [card :as card]
                          [user :as user])))

;; placeholder until we actually define real API routes
(defroutes routes
  ;; call /api/test to see this
  (GET "/test" [] {:status 200 :body {:message "We can serialize JSON <3"}})
  (GET "/card/:id" [id] (card/by-id id))
  (GET "/user/current" [] user/current)
  (route/not-found (fn [{:keys [request-method uri]}]
                        {:status 404
                         :body (str (.toUpperCase (name request-method)) " " uri " is not yet implemented.")})))
