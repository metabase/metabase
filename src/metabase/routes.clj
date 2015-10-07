(ns metabase.routes
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [compojure
             [core :refer [context defroutes GET]]
             [route :as route]]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api
             [dataset :as dataset-api]
             [routes :as api]]
            [metabase.core.initialization-status :as init-status]
            [metabase.util.embed :as embed]
            [ring.util
             [io :as ring-io]
             [response :as resp]]
            [stencil.core :as stencil]))

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
  (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format dataset-api/export-format-regex]
       [uuid export-format]
       (resp/redirect (format "/api/public/card/%s/query/%s" uuid export-format)))
  (GET "*" [] public))

(defroutes ^:private embed-routes
  (GET ["/question/:token.:export-format", :export-format dataset-api/export-format-regex]
       [token export-format]
       (resp/redirect (format "/api/embed/card/%s/query/%s" token export-format)))
  (GET "*" [] embed))

(defn- some-very-long-handler [_]
  (Thread/sleep 3000)
  {:success true})

(defn- streaming-response [handler]
  (fn [request]
    ;; TODO - handle exceptions  & have some sort of maximum timeout for these requests
    (let [response (future (handler request))
          f        (fn [^java.io.PipedOutputStream ostream]
                     (if (realized? response)
                       (json/generate-stream @response (io/writer ostream))
                       (do
                         (println "Response not ready, writing one byte & sleeping 500ms...")
                         (.write ostream (byte \ ))
                         (.flush ostream)
                         (Thread/sleep 500)
                         (recur ostream))))]
      (-> (resp/response (ring-io/piped-input-stream f))
          (resp/content-type "application/json")))))

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
  (context "/stream-test" []
    (streaming-response some-very-long-handler))
  ;; Anything else (e.g. /user/edit_current) should serve up index.html; React app will handle the rest
  (GET "*" [] index))
