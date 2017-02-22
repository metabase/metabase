(ns metabase.routes
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]
            [metabase.util.embed :as embed]))


(defn- entrypoint [entry embeddable? {:keys [uri]}]
  (-> (if ((resolve 'metabase.core/initialized?))
        (stencil/render-string (slurp (or (io/resource (str "frontend_client/" entry ".html"))
                                          (throw (Exception. (str "Cannot find './resources/frontend_client/" entry ".html'. Did you remember to build the Metabase frontend?")))))
                               {:bootstrap_json (json/generate-string (public-settings/public-settings))
                                :embed_code     (when embeddable? (embed/head uri))})
        (slurp (io/resource "frontend_client/init.html")))
      resp/response
      (resp/content-type "text/html; charset=utf-8")))

(def ^:private index  (partial entrypoint "index"  (not :embeddable)))
(def ^:private public (partial entrypoint "public" :embeddable))

(defroutes ^:private public-routes
  (GET ["/question/:uuid.csv"  :uuid u/uuid-regex] [uuid] (resp/redirect (format "/api/public/card/%s/query/csv"  uuid)))
  (GET ["/question/:uuid.json" :uuid u/uuid-regex] [uuid] (resp/redirect (format "/api/public/card/%s/query/json" uuid)))
  (GET "*" [] public))

(defroutes ^:private embed-routes
  (GET "/question/:token.csv"  [token] (resp/redirect (format "/api/embed/card/%s/query/csv"  token)))
  (GET "/question/:token.json" [token] (resp/redirect (format "/api/embed/card/%s/query/json" token)))
  (GET "*" [] public))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes ^{:doc "Top-level ring routes for Metabase."} routes
  ;; ^/$ -> index.html
  (GET "/" [] index)
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  ;; ^/api/ -> API routes
  (context "/api" [] api/routes)
  ; ^/app/ -> static files under frontend_client/app
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
