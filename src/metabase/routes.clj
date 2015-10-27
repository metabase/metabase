(ns metabase.routes
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.models.setting :as setting]))

(defn- index [_]
  (if ((resolve 'metabase.core/initialized?))
    (-> (io/resource "frontend_client/index.html")
        slurp
        (stencil/render-string {:bootstrap_json (json/generate-string (setting/public-settings))})
        resp/response
        (resp/content-type "text/html")
        (resp/header "Last-Modified" "{now} GMT"))
    (-> (io/resource "frontend_client/init.html")
        slurp
        resp/response
        (resp/content-type "text/html")
        (resp/header "Last-Modified" "{now} GMT"))))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes routes
  (GET "/" [] index)                                     ; ^/$           -> index.html
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  (context "/api" [] api/routes)                         ; ^/api/        -> API routes
  (context "/app" []
    (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
    (route/not-found {:status 404                        ; return 404 for anything else starting with ^/app/ that doesn't exist
                      :body "Not found."}))
  (GET "*" [] index))                                    ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
