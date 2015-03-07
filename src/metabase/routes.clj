(ns metabase.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.util.response :as resp]
            [metabase.api.routes :as api]))


(let [index (fn [_] (resp/resource-response "frontend_client/index.html"))]
  (defroutes routes
    (GET "/" [] index)                                     ; ^/$           -> index.html
    (context "/api" [] api/routes)                         ; ^/api/        -> API routes
    (context "/app" []
      (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
      (route/not-found {:status 404                        ;                  return 404 for anything else starting with ^/app/ that doesn't exist
                        :body "Not found."}))
    (GET "*" [] index)))                                   ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
