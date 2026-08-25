(ns metabase.server.routes.index
  "Logic related to loading various versions of the index.html template. The actual template lives in
  `resources/frontend_client/index_template.html`; when the frontend is built (e.g. via `./bin/build.sh frontend`)
  different versions that include the FE app are created as `index.html`, `public.html`, and `embed.html`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clout.core :as clout]
   [hiccup.util]
   [metabase.appearance.core :as appearance]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
   [metabase.users.settings :as users-settings]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memoize]
   [ring.util.response :as response]
   [stencil.core :as stencil])
  (:import
   (java.io FileNotFoundException)))

(set! *warn-on-reflection* true)

(defn- base-href []
  (let [path (some-> (system/site-url) io/as-url .getPath)]
    (str path "/")))

(defn- escape-script [s]
  ;; Escapes text to be included in an inline <script> tag, in particular the string '</script'
  ;; https://stackoverflow.com/questions/14780858/escape-in-script-tag-contents/23983448#23983448
  (str/replace s #"(?i)</script" "</scr\\\\ipt"))

(defn- fallback-localization [locale-or-name]
  (json/encode
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

(def ^:private route-preloads-resource "frontend_client/app/dist/route-preloads.json")

(defn- compile-entry
  "Compile an entry's URL patterns once, with the same matcher the API endpoints use."
  [entry]
  (update entry :patterns #(mapv clout/route-compile %)))

(defn- matches-route? [uri {:keys [patterns]}]
  (boolean (some #(clout/route-matches % {:uri uri}) patterns)))

(defn- load-route-preloads* []
  (when-let [resource (io/resource route-preloads-resource)]
    (try
      (mapv compile-entry (json/decode+kw (slurp resource)))
      (catch Throwable e
        ;; A page without hints is slower, not broken.
        (log/warnf e "Failed to read %s" route-preloads-resource)
        nil))))

(def ^:private ^{:arglists '([])} load-route-preloads (memoize/memo load-route-preloads*))

(defn- strip-base-path
  "The request URI carries the path Metabase is mounted under, and the manifest does not."
  [uri]
  (let [base (str/replace (base-href) #"/$" "")]
    (if (and (seq base) (str/starts-with? uri base))
      (subs uri (count base))
      uri)))

(defn- preload-tag
  "A preload hint for one file the page's chunk needs.

  `preload` rather than `prefetch`, because this is for the navigation in hand:
  a prefetch is held back until the browser is idle, which is after the load
  these hints are meant to speed up.

  `fetchpriority=\"low\"` because the page's chunk is wanted a moment after the
  app is, not before it. Without it these fetch at the same high priority as the
  entry scripts and take bandwidth from them, so the shell renders later. Low
  still starts with the document, which is the point: the alternative is a fetch
  that cannot begin until the app has parsed and run."
  [file]
  (format "<link rel=\"preload\" href=\"%s\" as=\"%s\" fetchpriority=\"low\">"
          (hiccup.util/escape-html file)
          (if (str/ends-with? file ".css") "style" "script")))

(defn- route-preload-tags
  "Preload hints for the page this URI renders.

  The page it lands on is a chunk of its own, and nothing in the document points
  at that chunk, so the browser only asks for it once the app has downloaded,
  parsed and run. These hints start that fetch while the app is still arriving.
  The manifest is built from the route files, in the order its patterns are to be
  tried; see `frontend/build/shared/rspack/route-preloads.js`."
  [uri]
  (let [path (strip-base-path (or uri "/"))]
    (when-let [entry (first (filter (partial matches-route? path) (load-route-preloads)))]
      (str/join (map preload-tag (:files entry))))))

(defn- load-inline-js* [resource-name]
  (slurp (io/resource (format "frontend_client/inline_js/%s.js" resource-name))))

(def ^:private ^{:arglists '([resource-name])} load-inline-js (memoize/memo load-inline-js*))

(defn- load-template [path variables]
  (try
    (stencil/render-file path variables)
    (catch IllegalArgumentException e
      (let [message (trs "Failed to load template ''{0}''. Did you remember to build the Metabase frontend?" path)]
        (log/error message (ex-message e))
        (throw (Exception. message e))))))

(defn- template-parameters
  [embeddable? {:keys [uri params nonce]}]
  (let [{:keys [anon-tracking-enabled google-auth-client-id], :as public-settings} (setting/user-readable-values-map #{:public})
        ;; We disable `locale` parameter on static embeds/public links (metabase#50313)
        should-load-locale-params? (not embeddable?)]
    {:bootstrapJS            (load-inline-js "index_bootstrap")
     :bootstrapJSON          (escape-script (json/encode public-settings))
     :assetOnErrorJS         (load-inline-js "asset_loading_error")
     :userLocalizationJSON   (escape-script (load-localization (when should-load-locale-params? (:locale params))))
     :siteLocalizationJSON   (escape-script (load-localization (system/site-locale)))
     :nonceJSON              (escape-script (json/encode nonce))
     :language               (hiccup.util/escape-html (or (i18n/user-locale-string) (system/site-locale)))
     :userColorScheme        (escape-script (json/encode (users-settings/color-scheme)))
     :favicon                (hiccup.util/escape-html (let [custom-favicon (appearance/application-favicon-url)]
                                                        (if (and config/is-dev?
                                                                 (= custom-favicon "app/assets/img/favicon.ico"))
                                                          "app/assets/img/favicon-dev.ico"
                                                          custom-favicon)))
     :applicationName        (hiccup.util/escape-html (appearance/application-name))
     :uri                    (hiccup.util/escape-html uri)
     :routePreloads          (when-not embeddable? (route-preload-tags uri))
     :baseHref               (hiccup.util/escape-html (base-href))
     :embedCode              (when embeddable? (embed/head (system/site-url) uri))
     :enableGoogleAuth       (boolean google-auth-client-id)
     :enableAnonTracking     (boolean anon-tracking-enabled)}))

(defn- load-entrypoint-template [entrypoint-name embeddable? opts]
  (load-template
   (str "frontend_client/" entrypoint-name ".html")
   (template-parameters embeddable? opts)))

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
(def embed-sdk  "/embed/sdk/v1 index.html entrypoint."  (partial entrypoint "embed-sdk"  :embeddable))
(def data-app   "/embed/apps/:name iframe entrypoint." (partial entrypoint "data-app"   :embeddable))
