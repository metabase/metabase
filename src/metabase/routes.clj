(ns metabase.routes
  (:require [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.util.response :as resp]
            [metabase.api.routes :as api]
            [metabase.setup :as setup]))


(let [redirect-to-setup? (fn [{:keys [uri]}]                                 ; If we have a setup token present and the user requests a _page_ other than /setup/
                           (and (setup/token-exists?)                        ; redirect them
                                (not (or (re-matches #"^/favicon.ico$" uri)
                                         (re-matches #"^/setup/.*$" uri)))))
      index (fn [request]
              (if (redirect-to-setup? request) (resp/redirect "/setup/welcome")
                  (resp/resource-response "frontend_client/index.html")))]
  (defroutes routes
    (GET "/" [] index)                                     ; ^/$           -> index.html
    (context "/api" [] api/routes)                         ; ^/api/        -> API routes
    (context "/app" []
      (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
      (route/not-found {:status 404                        ;                  return 404 for anything else starting with ^/app/ that doesn't exist
                        :body "Not found."}))
    (GET "*" [] index)))                                   ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
