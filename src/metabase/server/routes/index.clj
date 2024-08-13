(ns metabase.server.routes.index
  "Logic related to loading various versions of the index.html template. The actual template lives in
  `resources/frontend_client/index_template.html`; when the frontend is built (e.g. via `./bin/build.sh frontend`)
  different versions that include the FE app are created as `index.html`, `public.html`, and `embed.html`."
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [hiccup.util]
   [metabase.core.initialization-status :as init-status]
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.response :as response]
   [stencil.core :as stencil])
  (:import
   (java.io FileNotFoundException)))

(set! *warn-on-reflection* true)

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

(defn- localization-json-file-name [locale-string]
  (format "frontend_client/app/locales/%s.json" (str/replace locale-string \- \_)))

(defn- load-localization* [locale-string]
  (or
   (when locale-string
     (when-not (= locale-string "en")
       (try
         (slurp (or (io/resource (localization-json-file-name locale-string))
                    (when-let [fallback-locale (i18n/fallback-locale locale-string)]
                      (io/resource (localization-json-file-name (str fallback-locale))))
                    ;; don't try to i18n the Exception message below, we have no locale to translate it to!
                    (throw (FileNotFoundException. (format "Locale '%s' not found." locale-string)))))
         (catch Throwable e
           (log/warn (.getMessage e))))))
   (fallback-localization locale-string)))

(let [load-fn (memoize load-localization*)]
  (defn- load-localization
    "Load a JSON-encoded map of localized strings for the current user's Locale."
    [locale-override]
    (load-fn (or locale-override (i18n/user-locale-string)))))

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

(defn- load-entrypoint-template [entrypoint-name embeddable? {:keys [uri params nonce]}]
  (load-template
   (str "frontend_client/" entrypoint-name ".html")
   (let [{:keys [anon-tracking-enabled google-auth-client-id], :as public-settings} (setting/user-readable-values-map #{:public})]
     {:bootstrapJS          (load-inline-js "index_bootstrap")
      :bootstrapJSON        (escape-script (json/generate-string public-settings))
      :assetOnErrorJS       (load-inline-js "asset_loading_error")
      :userLocalizationJSON (escape-script (load-localization (:locale params)))
      :siteLocalizationJSON (escape-script (load-localization (public-settings/site-locale)))
      :nonceJSON            (escape-script (json/generate-string nonce))
      :language             (hiccup.util/escape-html (public-settings/site-locale))
      :favicon              (hiccup.util/escape-html (public-settings/application-favicon-url))
      :applicationName      (hiccup.util/escape-html (public-settings/application-name))
      :uri                  (hiccup.util/escape-html uri)
      :baseHref             (hiccup.util/escape-html (base-href))
      :embedCode            (when embeddable? (embed/head uri))
      :enableGoogleAuth     (boolean google-auth-client-id)
      :enableAnonTracking   (boolean anon-tracking-enabled)})))

(defn- load-init-template []
  (load-template
    "frontend_client/init.html"
    {:initJS (load-inline-js "init")}))

(defn- entrypoint
  "Response that serves up an entrypoint into the Metabase application, e.g. `index.html`."
  [entrypoint-name embeddable? request respond _raise]
  (respond
    (-> (response/response (if (init-status/complete?)
                             (load-entrypoint-template entrypoint-name embeddable? request)
                             (load-init-template)))
        (response/content-type "text/html; charset=utf-8"))))

(def index  "main index.html entrypoint."    (partial entrypoint "index"  (not :embeddable)))
(def public "/public index.html entrypoint." (partial entrypoint "public" :embeddable))
(def embed  "/embed index.html entrypoint."  (partial entrypoint "embed"  :embeddable))
