(ns metabase.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.util.response :as resp]
            [metabase.api.routes :as api]))

(letfn [(serve-index [_] (-> (resp/file-response "frontend_client/index.html")
                             (assoc :status 200)))]
  (defroutes routes
    (GET "/" [] serve-index)                            ; ^/$    -> index.html
    (context "/api" [] api/routes)                      ; ^/api/ -> API routes
    (route/files "/app/" {:root "frontend_client/app"}) ; ^/app/ -> static files under frontend_client/app
    (route/not-found serve-index)))                     ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
