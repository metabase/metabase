(ns metabase.server.routes.index
  "Logic related to loading various versions of the index.html template. The actual template lives in
  `resources/frontend_client/index_template.html`; when the frontend is built (e.g. via `./bin/build.sh frontend`)
  different versions that include the FE app are created as `index.html`, `public.html`, and `embed.html`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [hiccup.util]
   [metabase.appearance.core :as appearance]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
   [metabase.users.settings :as users-settings]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memoize]
   [ring.util.codec :as codec]
   [ring.util.response :as response]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(defn- base-href []
  (let [path (some-> (system/site-url) io/as-url .getPath)]
    (str path "/")))

(defn- escape-script [s]
  ;; Escapes text to be included in an inline <script> tag, in particular the string '</script'
  ;; https://stackoverflow.com/questions/14780858/escape-in-script-tag-contents/23983448#23983448
  (str/replace s #"(?i)</script" "</scr\\\\ipt"))

(defn- catalogue-name
  "The catalogue chunks are named with an underscore, `locales.clj` lists them with a dash."
  [locale-string]
  (some-> locale-string (str/replace \- \_)))

(def ^:private catalogue-names
  (delay (into #{} (map catalogue-name) (i18n/available-locale-names))))

(defn- catalogue-locale*
  [locale-string]
  ;; English short circuits: it is the msgid source, and its own fallback is the `en_ZZ` pseudo-locale.
  (or (when-not (= (catalogue-name locale-string) "en")
        (->> [locale-string (some-> (i18n/fallback-locale locale-string) str)]
             (keep catalogue-name)
             (remove #{"en"})
             (filter @catalogue-names)
             first))
      "en"))

(let [resolve-fn (memoize catalogue-locale*)]
  (defn- catalogue-locale
    "The locale whose catalogue the document should load, or `en` when there is none to load.
    `en` is the msgid source and has no catalogue of its own."
    [locale-string]
    (resolve-fn locale-string)))

(defn- locale-script-urls*
  "Locale to catalogue chunk url, written by the frontend build. Empty when the frontend has not been built."
  []
  (some-> (io/resource "frontend_client/app/dist/locale-manifest.json") slurp json/decode))

(def ^:private ^{:arglists '([])} locale-script-urls (memoize/memo locale-script-urls*))

(defn- locale-scripts
  "Script tags for the catalogue chunks this request needs, at most one per distinct locale."
  [locales]
  (->> locales
       (map #(format "<script src=\"%s\"></script>" (hiccup.util/escape-html %)))
       (str/join "\n    ")))

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
        should-load-locale-params? (not embeddable?)
        user-locale                (catalogue-locale (or (when should-load-locale-params? (:locale params))
                                                         (i18n/user-locale-string)))
        site-locale                (catalogue-locale (system/site-locale))
        ;; Only the catalogues this document loads. Any other locale the app switches
        ;; to reads the manifest instead, which most sessions never need.
        locale-urls                (select-keys (or (locale-script-urls) {})
                                                (distinct [user-locale site-locale]))]
    {:bootstrapJS            (load-inline-js "index_bootstrap")
     :bootstrapJSON          (escape-script (json/encode public-settings))
     :assetOnErrorJS         (load-inline-js "asset_loading_error")
     :userLocale             (escape-script user-locale)
     :siteLocale             (escape-script site-locale)
     :localeScripts          (locale-scripts (vals locale-urls))
     :nonce                  (hiccup.util/escape-html nonce)
     :language               (hiccup.util/escape-html (or (i18n/user-locale-string) (system/site-locale)))
     :userColorScheme        (escape-script (json/encode (users-settings/color-scheme)))
     :favicon                (hiccup.util/escape-html (let [custom-favicon (appearance/application-favicon-url)]
                                                        (if (and config/is-dev?
                                                                 (= custom-favicon "app/assets/img/favicon.ico"))
                                                          "app/assets/img/favicon-dev.ico"
                                                          custom-favicon)))
     :applicationName        (hiccup.util/escape-html (appearance/application-name))
     :uri                    (hiccup.util/escape-html uri)
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
(def ^:private data-app-shell
  "Raw `/embed/apps/:name` iframe HTML entrypoint, before feature gating."
  (partial entrypoint "data-app" :embeddable))

(defn- login-redirect
  "302 to the login page, returning the user to the top-level `/apps/...` page for the
   `/embed/apps/...` iframe document they asked for (the bare iframe shell is not a page
   a person would want to land on). `site-url` is nil until a superuser's first request
   sets it, and this is reached by signed-out visitors: `str` drops the nil, so the
   redirect is then relative."
  [{:keys [uri query-string]}]
  (let [target (cond-> (str/replace-first uri #"^/embed/" "/")
                 (seq query-string) (str "?" query-string))]
    (response/redirect (str (system/site-url) "/auth/login?redirect=" (codec/url-encode target)))))

(defn data-app
  "`/embed/apps/:name` iframe entrypoint. Served only when the `:data-apps-preview` feature is
   enabled; without it, responds nil so routing falls through to the generic embed handler — the
   instance then behaves exactly as if data apps did not exist, keeping the feature gate with the
   data-app entrypoint rather than in the top-level route table. A signed-out visitor is sent to
   the login page: the document's CSP carries the app's `allowed_hosts`, which only signed-in
   users may see."
  [request respond raise]
  (cond
    (not (premium-features/enable-data-apps?)) (respond nil)
    (nil? (:metabase-user-id request))         (respond (login-redirect request))
    :else                                      (data-app-shell request respond raise)))
