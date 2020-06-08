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
            [metabase.models.setting :as setting]
            [metabase.public-settings :as public-settings]
            [metabase.util
             [embed :as embed]
             [i18n :as i18n :refer [trs]]]
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


(defn- fallback-localization [locale-or-name]
  (json/generate-string
   {"headers"
    {"language"     (str locale-or-name)
     "plural-forms" "nplurals=2; plural=(n != 1);"}

    "translations"
    {"" {"Metabase" {"msgid"  "Metabase"
                     "msgstr" ["Metabase"]}}}}))

(defn- localization-json-file-name [locale-or-name]
  (format "frontend_client/app/locales/%s.json" (str (i18n/locale locale-or-name))))

(defn- load-localization* [locale-or-name]
  (or
   (when-let [locale-name (some-> locale-or-name str)]
     (when-not (= locale-name "en")
       (try
         (slurp (or (io/resource (localization-json-file-name locale-name))
                    (when-let [parent-locale (i18n/parent-locale locale-name)]
                      (io/resource (localization-json-file-name (str parent-locale))))
                    ;; don't try to i18n the Exception message below, we have no locale to translate it to!
                    (throw (FileNotFoundException. (format "Locale '%s' not found." locale-name)))))
         (catch Throwable e
           (log/warn (.getMessage e))))))
   (fallback-localization locale-or-name)))

(def ^:private ^{:arglists '([])} load-localization
  "Load a JSON-encoded map of localized strings for the current user's Locale."
  (comp (memoize load-localization*) #(some-> (i18n/user-locale) str)))

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
   (let [{:keys [anon-tracking-enabled google-auth-client-id], :as public-settings} (setting/properties :public)]
     {:bootstrapJS        (load-inline-js "index_bootstrap")
      :googleAnalyticsJS  (load-inline-js "index_ganalytics")
      :bootstrapJSON      (escape-script (json/generate-string public-settings))
      :localizationJSON   (escape-script (load-localization))
      :uri                (h.util/escape-html uri)
      :baseHref           (h.util/escape-html (base-href))
      :embedCode          (when embeddable? (embed/head uri))
      :enableGoogleAuth   (boolean google-auth-client-id)
      :enableAnonTracking (boolean anon-tracking-enabled)})))

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
