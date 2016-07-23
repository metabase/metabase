(ns metabase.routes
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.public-settings :as public-settings]))

(defn- index [_]
  (-> (if ((resolve 'metabase.core/initialized?))
        (stencil/render-string (slurp (or (io/resource "frontend_client/index.html")
                                          (throw (Exception. "Cannot find './resources/frontend_client/index.html'. Did you remember to build the Metabase frontend?"))))
                               {:bootstrap_json (json/generate-string (public-settings/public-settings))})
        (slurp (io/resource "frontend_client/init.html")))
      resp/response
      (resp/content-type "text/html")))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes ^{:doc "Top-level ring routes for Metabase."} routes
  (GET "/" [] index)                                     ; ^/$           -> index.html
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  (context "/api" [] api/routes)                         ; ^/api/        -> API routes
  (context "/app" []
    (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
    (route/not-found {:status 404                        ; return 404 for anything else starting with ^/app/ that doesn't exist
                      :body "Not found."}))
  (GET "*" [] index))                                    ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
