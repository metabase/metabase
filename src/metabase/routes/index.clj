(ns metabase.routes.index
  "Logic related to loading various versions of the index.html template. The actual template lives in
  `resources/frontend_client/index_template.html`; when the frontend is built (e.g. via `./bin/build frontend`)
  different versions that include the FE app are created as `index.html`, `public.html`, and `embed.html`."
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [hiccup.util :as h.util]
            [metabase.core.initialization-status :as init-status]
            [metabase.public-settings :as public-settings]
            [metabase.util
             [embed :as embed]
             [i18n :refer [trs]]]
            [puppetlabs.i18n.core :refer [*locale*]]
            [ring.util.response :as resp]
            [stencil.core :as stencil])
  (:import java.io.FileNotFoundException))

(defn- base-href []
  (let [path (some-> (public-settings/site-url) io/as-url .getPath)]
    (str path "/")))

(defn- escape-script [s]
  ;; Escapes text to be included in an inline <script> tag, in particular the string '</script'
  ;; https://stackoverflow.com/questions/14780858/escape-in-script-tag-contents/23983448#23983448
  (str/replace s #"(?i)</script" "</scr\\\\ipt"))


(defn- fallback-localization [locale]
  (json/generate-string
   {"headers"
    {"language"     locale
     "plural-forms" "nplurals=2; plural=(n != 1);"}

    "translations"
    {"" {"Metabase" {"msgid"  "Metabase"
                     "msgstr" ["Metabase"]}}}}))

(defn- load-localization* [locale]
  (or
   (when (and locale (not= locale "en"))
     (try
       (slurp (or (io/resource (str "frontend_client/app/locales/" locale ".json"))
                  ;; don't try to i18n the Exception message below, we have no locale to translate it to!
                  (throw (FileNotFoundException. (format "Locale '%s' not found." locale)))))
       (catch Throwable e
         (log/warn (.getMessage e)))))
   (fallback-localization locale)))

(def ^:private ^{:arglists '([])} load-localization
  (let [memoized-load-localization (memoize load-localization*)]
    (fn []
      (memoized-load-localization *locale*))))

(defn- load-inline-js* [resource-name]
  (slurp (io/resource (format "frontend_client/inline_js/%s.js" resource-name))))

(def ^:private ^{:arglists '([resource-name])} load-inline-js (memoize load-inline-js*))

(defn- load-template [path variables]
  (try
    (stencil/render-file path variables)
    (catch IllegalArgumentException e
      (let [message (trs "Failed to load template ''{0}''. Did you remember to build the Metabase frontend?" path)]
        (log/error e message)
        (throw (Exception. message e))))))

(defn- load-entrypoint-template [entrypoint-name embeddable? uri]
  (load-template
   (str "frontend_client/" entrypoint-name ".html")
   (let [{:keys [anon_tracking_enabled google_auth_client_id], :as public-settings} (public-settings/public-settings)]
     {:bootstrapJS        (load-inline-js "index_bootstrap")
      :googleAnalyticsJS  (load-inline-js "index_ganalytics")
      :webFontConfigJS    (load-inline-js "index_webfontconfig")
      :bootstrapJSON      (escape-script (json/generate-string public-settings))
      :localizationJSON   (escape-script (load-localization))
      :uri                (h.util/escape-html uri)
      :baseHref           (h.util/escape-html (base-href))
      :embedCode          (when embeddable? (embed/head uri))
      :enableGoogleAuth   (boolean google_auth_client_id)
      :enableAnonTracking (boolean anon_tracking_enabled)})))

(defn- load-init-template []
  (load-template
    "frontend_client/init.html"
    {:initJS (load-inline-js "init")}))

(defn- entrypoint
  "Repsonse that serves up an entrypoint into the Metabase application, e.g. `index.html`."
  [entrypoint-name embeddable? {:keys [uri]} respond raise]
  (respond
    (-> (resp/response (if (init-status/complete?)
                         (load-entrypoint-template entrypoint-name embeddable? uri)
                         (load-init-template)))
        (resp/content-type "text/html; charset=utf-8"))))

(def index  "main index.html entrypoint."    (partial entrypoint "index"  (not :embeddable)))
(def public "/public index.html entrypoint." (partial entrypoint "public" :embeddable))
(def embed  "/embed index.html entrypoint."  (partial entrypoint "embed"  :embeddable))
