(ns metabase.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.util.response :as resp]
            [metabase.api.routes :as api]))

(defn- serve-file
  "Returns a function that takes REQUEST and serves FILE."
  [file]
  (fn [_]
    (resp/file-response file)))

(let [index (serve-file "frontend_client/index.html")
      admin (serve-file "frontend_client/admin_index.html")]
  (defroutes routes
    (GET "/" [] index)                                  ; ^/$           -> index.html
    (context "/api" [] api/routes)                      ; ^/api/        -> API routes
    (route/files "/app/" {:root "frontend_client/app"}) ; ^/app/        -> static files under frontend_client/app
    (GET "/:org-slug/admin/*" [] admin)                 ; ^/org/admin/* -> admin_index.html
    (GET "*" [] index)))                                ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
