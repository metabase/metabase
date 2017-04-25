(ns metabase.routes
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.core.initialization-status :as init-status]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]
            [metabase.util.embed :as embed]))

(defn- load-file-at-path [path]
  (slurp (or (io/resource path)
             (throw (Exception. (str "Cannot find '" path "'. Did you remember to build the Metabase frontend?"))))))

(defn- load-template [path variables]
  (stencil/render-string (load-file-at-path path) variables))

(defn- entrypoint [entry embeddable? {:keys [uri]}]
  (-> (if (init-status/complete?)
        (load-template (str "frontend_client/" entry ".html")
                       {:bootstrap_json (json/generate-string (public-settings/public-settings))
                        :embed_code     (when embeddable? (embed/head uri))})
        (load-file-at-path "frontend_client/init.html"))
      resp/response
      (resp/content-type "text/html; charset=utf-8")))

(def ^:private index  (partial entrypoint "index"  (not :embeddable)))
(def ^:private public (partial entrypoint "public" :embeddable))
(def ^:private embed  (partial entrypoint "embed"  :embeddable))

(defroutes ^:private public-routes
  (GET ["/question/:uuid.csv"  :uuid u/uuid-regex] [uuid] (resp/redirect (format "/api/public/card/%s/query/csv"  uuid)))
  (GET ["/question/:uuid.json" :uuid u/uuid-regex] [uuid] (resp/redirect (format "/api/public/card/%s/query/json" uuid)))
  (GET "*" [] public))

(defroutes ^:private embed-routes
  (GET "/question/:token.csv"  [token] (resp/redirect (format "/api/embed/card/%s/query/csv"  token)))
  (GET "/question/:token.json" [token] (resp/redirect (format "/api/embed/card/%s/query/json" token)))
  (GET "*" [] embed))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes ^{:doc "Top-level ring routes for Metabase."} routes
  ;; ^/$ -> index.html
  (GET "/" [] index)
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  ;; ^/api/health -> Health Check Endpoint
  (GET "/api/health" [] (if (init-status/complete?)
                          {:status 200, :body {:status "ok"}}
                          {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))
  ;; ^/api/ -> All other API routes
  (context "/api" [] (fn [& args]
                       ;; if Metabase is not finished initializing, return a generic error message rather than something potentially confusing like "DB is not set up"
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
  (GET "*" [] index))
