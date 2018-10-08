(ns metabase.routes
  "Main Compojure routes tables. See https://github.com/weavejester/compojure/wiki/Routes-In-Detail for details about
   how these work. `/api/` routes are in `metabase.api.routes`."
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
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
            [puppetlabs.i18n.core :refer [*locale*]]
            [ring.util.response :as resp]
            [stencil.core :as stencil]))

(defn- base-href []
  (str (.getPath (io/as-url (public-settings/site-url))) "/"))

(defn- escape-script [s]
  ;; Escapes text to be included in an inline <script> tag, in particular the string '</script'
  ;; https://stackoverflow.com/questions/14780858/escape-in-script-tag-contents/23983448#23983448
  (str/replace s #"</script" "</scr\\\\ipt"))

(defn- load-file-at-path [path]
  (slurp (or (io/resource path)
             (throw (Exception. (str "Cannot find '" path "'. Did you remember to build the Metabase frontend?"))))))

(defn- load-template [path variables]
  (stencil/render-string (load-file-at-path path) variables))

(defn- fallback-localization
  [locale]
  (json/generate-string {"headers" {"language" locale
                                    "plural-forms" "nplurals=2; plural=(n != 1);"}
                         "translations" {"" {"Metabase" {"msgid" "Metabase"
                                                         "msgstr" ["Metabase"]}}}}))

(defn- load-localization []
  (if (and *locale* (not= (str *locale*) "en"))
    (try
      (load-file-at-path (str "frontend_client/app/locales/" *locale* ".json"))
    (catch Throwable e
      (log/warn (str "Locale " *locale* " not found."))
      (fallback-localization *locale*)))
    (fallback-localization *locale*)))

(defn- entrypoint
  "Repsonse that serves up an entrypoint into the Metabase application, e.g. `index.html`."
  [entry embeddable? {:keys [uri]}]
  (-> (if (init-status/complete?)
        (load-template (str "frontend_client/" entry ".html")
                       {:bootstrap_json    (escape-script (json/generate-string (public-settings/public-settings)))
                        :localization_json (escape-script (load-localization))
                        :uri               (escape-script (json/generate-string uri))
                        :base_href         (escape-script (json/generate-string (base-href)))
                        :embed_code        (when embeddable? (embed/head uri))})
        (load-file-at-path "frontend_client/init.html"))
      resp/response
      (resp/content-type "text/html; charset=utf-8")))

(def ^:private index  (partial entrypoint "index"  (not :embeddable)))
(def ^:private public (partial entrypoint "public" :embeddable))
(def ^:private embed  (partial entrypoint "embed"  :embeddable))

(defn- redirect-including-query-string
  "Like `resp/redirect`, but passes along query string URL params as well. This is important because the public and
   embedding routes below pass query params (such as template tags) as part of the URL."
  [url]
  (fn [{:keys [query-string]}]
    (resp/redirect (str url "?" query-string))))

;; /public routes. /public/question/:uuid.:export-format redirects to /api/public/card/:uuid/query/:export-format
(defroutes ^:private public-routes
  (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format dataset-api/export-format-regex]
       [uuid export-format]
       (redirect-including-query-string (format "%s/api/public/card/%s/query/%s" (public-settings/site-url) uuid export-format)))
  (GET "*" [] public))

;; /embed routes. /embed/question/:token.:export-format redirects to /api/public/card/:token/query/:export-format
(defroutes ^:private embed-routes
  (GET ["/question/:token.:export-format", :export-format dataset-api/export-format-regex]
       [token export-format]
       (redirect-including-query-string (format "%s/api/embed/card/%s/query/%s" (public-settings/site-url) token export-format)))
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
  (GET "*" [] index))
