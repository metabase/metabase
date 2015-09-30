(ns metabase.routes
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            (metabase.models common
                             [setting :as setting])
            (metabase [config :as config]
                      [setup :as setup])
            metabase.util.password))

(defn- index-page-vars
  "Static values that we inject into the index.html page via Mustache."
  []
  {:ga_code               "UA-60817802-1"
   :intercom_code         "gqfmsgf1"
   :password_complexity   (metabase.util.password/active-password-complexity)
   :setup_token           (setup/token-value)
   :timezones             metabase.models.common/timezones
   :version               (config/mb-version-info)
   ;; all of these values are dynamic settings from the admin UI but we include them here for bootstrapping availability
   :anon-tracking-enabled (setting/get :anon-tracking-enabled)
   :-site-name            (setting/get :-site-name)})

(defn- index [request]
  (-> (io/resource "frontend_client/index.html")
      slurp
      (stencil/render-string {:bootstrap_json (json/generate-string (index-page-vars))})
      resp/response
      (resp/content-type "text/html")))

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
