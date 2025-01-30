(ns metabase.server.routes
  "Main Compojure routes tables. See https://github.com/weavejester/compojure/wiki/Routes-In-Detail for details about
   how these work. `/api/` routes are in `metabase.api.routes`."
  (:require
   [compojure.core :refer [GET OPTIONS]]
   [compojure.route :as route]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.routes :as api]
   [metabase.api.util.handlers :as handlers]
   [metabase.core.initialization-status :as init-status]
   [metabase.db :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.public-settings :as public-settings]
   [metabase.server.auth-wrapper :as auth-wrapper]
   [metabase.server.routes.index :as index]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(defn- redirect-including-query-string
  "Like `response/redirect`, but passes along query string URL params as well. This is important because the public and
   embedding routes below pass query params (such as template tags) as part of the URL."
  [url]
  (fn [{:keys [query-string]} respond _raise]
    (respond (response/redirect (str url "?" query-string)))))

;; /public routes. /public/question/:uuid.:export-format redirects to /api/public/card/:uuid/query/:export-format
(def ^:private ^{:arglists '([request respond raise])} public-routes
  (handlers/routes
   (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format api.dataset/export-format-regex]
     [uuid export-format]
     (redirect-including-query-string
      (format "%s/api/public/card/%s/query/%s" (public-settings/site-url) uuid export-format)))
   (GET "*" [] index/public)))

;; /embed routes. /embed/question/:token.:export-format redirects to /api/public/card/:token/query/:export-format
(def ^:private ^{:arglists '([request respond raise])} embed-routes
  (handlers/routes
   (GET ["/question/:token.:export-format", :export-format api.dataset/export-format-regex]
     [token export-format]
     (redirect-including-query-string
      (format "%s/api/embed/card/%s/query/%s" (public-settings/site-url) token export-format)))
   (GET "*" [] index/embed)))

(def ^:private ^{:arglists '([request respond raise])} api-routes
  (handlers/routes
   ;; ^/api/health -> Health Check Endpoint
   (GET "/health" []
     (if (init-status/complete?)
       (try (if (or (mdb/recent-activity?)
                    (sql-jdbc.conn/can-connect-with-spec? {:datasource (mdb/data-source)}))
              {:status 200, :body {:status "ok"}}
              {:status 503 :body {:status "Unable to get app-db connection"}})
            (catch Exception e
              (log/warn e "Error in api/health database check")
              {:status 503 :body {:status "Error getting app-db connection"}}))
       {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))
   (OPTIONS "/*" [] {:status 200 :body ""})
   ;; ^/api/ -> All other API routes
   (fn [request respond raise]
     ;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
     ;;
     ;; if Metabase is not finished initializing, return a generic error message rather than
     ;; something potentially confusing like "DB is not set up"
     (if-not (init-status/complete?)
       (respond {:status 503, :body "Metabase is still initializing. Please sit tight..."})
       (api/routes request respond raise)))))

(def ^:private ^{:arglists '([request respond raise])} app-routes
  "^/app/ -> static files under frontend_client/app"
  (handlers/routes
   (route/resources "/" {:root "frontend_client/app"})
   ;; return 404 for anything else starting with ^/app/ that doesn't exist
   (route/not-found {:status 404, :body "Not found."})))

(def ^{:arglists '([request respond raise])} routes
  "Top-level ring routes for Metabase."
  (handlers/routes
   auth-wrapper/routes
   ;; ^/$ -> index.html
   (GET "/" [] index/index)
   (handlers/route-map-handler
    {"/api"    api-routes
     "/app"    app-routes
     "/public" public-routes  ; ^/public/ -> Public frontend and download routes
     "/embed"  embed-routes}) ; ^/emebed/ -> Embed frontend and download routes
   (GET "/favicon.ico" [] (response/resource-response (public-settings/application-favicon-url)))
   ;; Anything else (e.g. /user/edit_current) should serve up index.html; React app will handle the rest
   (GET "*" [] index/index)))
