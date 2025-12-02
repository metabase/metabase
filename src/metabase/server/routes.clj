(ns metabase.server.routes
  "Main Compojure routes tables. See https://github.com/weavejester/compojure/wiki/Routes-In-Detail for details about
   how these work. `/api/` routes are in [[metabase.api-routes.routes]]."
  (:require
   [compojure.core :as compojure :refer #_{:clj-kondo/ignore [:discouraged-var]} [context defroutes GET OPTIONS]]
   [compojure.route :as route]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.initialization-status.core :as init-status]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.server.auth-wrapper :as auth-wrapper]
   [metabase.server.middleware.embedding-sdk-bundle :as mw.embedding-sdk-bundle]
   [metabase.server.routes.index :as index]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [ring.util.response :as response]))

(defn- redirect-including-query-string
  "Like `response/redirect`, but passes along query string URL params as well. This is important because the public and
   embedding routes below pass query params (such as template tags) as part of the URL."
  [url]
  (fn [{:keys [query-string]} respond _raise]
    (respond (response/redirect (str url "?" query-string)))))

;; /public routes. /public/question/:uuid.:export-format redirects to /api/public/card/:uuid/query/:export-format
#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private ^{:arglists '([request respond raise])} public-routes
  (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format qp.schema/export-formats-regex]
    [uuid export-format]
    (redirect-including-query-string (format "%s/api/public/card/%s/query/%s" (system/site-url) uuid export-format)))
  (GET "*" [] index/public))

;; /embed routes.
;; /embed/sdk/v1 -> new iframe embedding based on embedding sdk components
;; /embed/question/:token.:export-format redirects to /api/public/card/:token/query/:export-format
#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private ^{:arglists '([request respond raise])} embed-routes
  (GET "/sdk/v1" [] index/embed-sdk)
  (GET ["/question/:token.:export-format", :export-format qp.schema/export-formats-regex]
    [token export-format]
    (redirect-including-query-string (format "%s/api/embed/card/%s/query/%s" (system/site-url) token export-format)))
  (GET "*" [] index/embed))

(defn- health-handler
  ([]
   (if (init-status/complete?)
     (try
       (if (or (mdb/recent-activity?)
               (mdb/can-connect-to-data-source? (mdb/data-source)))
         {:status 200, :body {:status "ok"}}
         {:status 503 :body {:status "Unable to get app-db connection"}})
       (catch Exception e
         (log/warn e "Error in api/health database check")
         {:status 503 :body {:status "Error getting app-db connection"}}))
     {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))

  ([_request respond _raise]
   (respond (health-handler))))

(defn- livez-handler
  "Simple liveness probe that does not perform any database checks. Always returns 200 with the
  same body format as `/api/health` when healthy."
  ([] {:status 200, :body {:status "ok"}})
  ([_request respond _raise]
   (respond (livez-handler))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private static-files-handler
  (GET "/embedding-sdk.js" request
    ((mw.embedding-sdk-bundle/serve-bundle-handler) request))

  ;; fall back to serving _all_ other files under /app
  (route/resources "/" {:root "frontend_client/app"})
  (route/not-found {:status 404 :body "Not found."}))

(mu/defn- api-handler :- ::api.macros/handler
  [api-routes :- ::api.macros/handler]
  (fn api-handler* [request respond raise]
    ;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
    ;;
    ;; if Metabase is not finished initializing, return a generic error message rather than
    ;; something potentially confusing like "DB is not set up"
    (if-not (init-status/complete?)
      (respond {:status 503, :body "Metabase is still initializing. Please sit tight..."})
      (api-routes request respond raise))))

(mu/defn make-routes :- ::api.macros/handler
  "Create the top-level Ring route handler for Metabase."
  [api-routes :- ::api.macros/handler]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (compojure/routes
   auth-wrapper/routes
   ;; ^/$ -> index.html
   (GET "/" [] index/index)
   (GET "/favicon.ico" [] (response/resource-response (appearance/application-favicon-url)))
   ;; ^/api/health -> Health Check Endpoint
   (GET "/api/health" [] health-handler)
   ;; ^/readyz -> Readiness probe (same implementation as /api/health)
   (GET "/readyz" [] health-handler)
   ;; ^/livez -> Liveness probe (no DB access)
   (GET "/livez" [] livez-handler)

   ;; Handle CORS preflight requests for auth routes
   (OPTIONS "/auth/*" [] {:status 200 :body ""})
   (OPTIONS "/api/*" [] {:status 200 :body ""})

   ;; ^/api/ -> All other API routes
   (context "/api" [] (api-handler api-routes))
   ;; ^/app/ -> static files under frontend_client/app
   (context "/app" [] static-files-handler)
   ;; ^/public/ -> Public frontend and download routes
   (context "/public" [] public-routes)
   ;; ^/emebed/ -> Embed frontend and download routes
   (context "/embed" [] embed-routes)
   ;; Anything else (e.g. /user/edit_current) should serve up index.html; React app will handle the rest
   (GET "*" [] index/index)))

;;; TODO -- if anything changes here we should rebuild these routes? We need a version
;;; of [[metabase.server.handler/dev-handler]] for these routes
