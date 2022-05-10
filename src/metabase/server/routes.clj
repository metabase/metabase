(ns metabase.server.routes
  "Main Compojure routes tables. See https://github.com/weavejester/compojure/wiki/Routes-In-Detail for details about
   how these work. `/api/` routes are in `metabase.api.routes`."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [metabase.api.dataset :as api.dataset]
            [metabase.api.routes :as api]
            [metabase.core.initialization-status :as init-status]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.server.routes.index :as index]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [ring.util.response :as response]
            [toucan.db :as db]))

(u/ignore-exceptions (classloader/require '[metabase-enterprise.sso.api.routes :as ee.sso.routes]))

(defn- redirect-including-query-string
  "Like `response/redirect`, but passes along query string URL params as well. This is important because the public and
   embedding routes below pass query params (such as template tags) as part of the URL."
  [url]
  (fn [{:keys [query-string]} respond _]
    (respond (response/redirect (str url "?" query-string)))))

;; /public routes. /public/question/:uuid.:export-format redirects to /api/public/card/:uuid/query/:export-format
(defroutes ^:private public-routes
  (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format api.dataset/export-format-regex]
       [uuid export-format]
       (redirect-including-query-string (format "%s/api/public/card/%s/query/%s" (public-settings/site-url) uuid export-format)))
  (GET "*" [] index/public))

;; /embed routes. /embed/question/:token.:export-format redirects to /api/public/card/:token/query/:export-format
(defroutes ^:private embed-routes
  (GET ["/question/:token.:export-format", :export-format api.dataset/export-format-regex]
       [token export-format]
       (redirect-including-query-string (format "%s/api/embed/card/%s/query/%s" (public-settings/site-url) token export-format)))
  (GET "*" [] index/embed))

(defroutes ^{:doc "Top-level ring routes for Metabase."} routes
  (or (some-> (resolve 'ee.sso.routes/routes) var-get)
      (fn [_ respond _]
        (respond nil)))
  ;; ^/$ -> index.html
  (GET "/" [] index/index)
  (GET "/favicon.ico" [] (response/resource-response (public-settings/application-favicon-url)))
  ;; ^/api/health -> Health Check Endpoint
  (GET "/api/health" [] (if (init-status/complete?)
                          (try (db/query {:select [[1 :working]]})
                               {:status 200, :body {:status "ok"}}
                               (catch Exception e
                                 (log/warn e (trs "Error in api/health database check"))
                                 {:status 503 :body {:status "Error getting db connection"}}))
                          {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))
  ;; ^/api/ -> All other API routes
  (context "/api" [] (fn [& args]
                       ;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
                       ;;
                       ;; if Metabase is not finished initializing, return a generic error message rather than
                       ;; something potentially confusing like "DB is not set up"
                       (if-not (init-status/complete?)
                         {:status 503, :body "Metabase is still initializing. Please sit tight..."}
                         (apply api/routes args))))
  ;; ^/app/ -> static files under frontend_client/app
  (context "/app" []
    (route/resources "/" {:root "frontend_client/app"})
    ;; return 404 for anything else starting with ^/app/ that doesn't exist
    (route/not-found {:status 404, :body "Not found."}))
  ;; ^/public/ -> Public frontend and download routes
  (context "/public" [] public-routes)
  ;; ^/emebed/ -> Embed frontend and download routes
  (context "/embed" [] embed-routes)
  ;; Anything else (e.g. /user/edit_current) should serve up index.html; React app will handle the rest
  (GET "*" [] index/index))
