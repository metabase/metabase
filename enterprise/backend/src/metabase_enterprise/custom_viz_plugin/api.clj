(ns metabase-enterprise.custom-viz-plugin.api
  "/api/ee/custom-viz-plugin endpoints."
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.server.streaming-response :as sr]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedReader InputStream InputStreamReader OutputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Dev-mode guard ------------------------------------------------

(defn- check-dev-mode-enabled!
  "Throws a 403 if dev mode is not enabled via MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED."
  []
  (api/check (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
             [403 "Custom visualization plugin dev mode is not enabled."]))

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private CustomVizPluginResponse
  [:map
   [:id              ms/PositiveInt]
   [:repo_url        ms/NonBlankString]
   [:display_name    ms/NonBlankString]
   [:identifier      ms/NonBlankString]
   [:status          [:enum :active :error]]
   [:enabled         :boolean]
   [:icon            {:optional true} [:maybe :string]]
   [:error_message   {:optional true} [:maybe :string]]
   [:pinned_version  {:optional true} [:maybe :string]]
   [:resolved_commit {:optional true} [:maybe :string]]
   [:dev_bundle_url  {:optional true} [:maybe :string]]
   [:dev_only        :boolean]
   [:manifest        {:optional true} [:maybe :any]]
   [:metabase_version {:optional true} [:maybe :string]]
   [:created_at      :any]
   [:updated_at      :any]])

(def ^:private CustomVizPluginRuntimeResponse
  [:map
   [:id              ms/PositiveInt]
   [:identifier      ms/NonBlankString]
   [:display_name    ms/NonBlankString]
   [:icon            {:optional true} [:maybe :string]]
   [:bundle_url      ms/NonBlankString]
   [:resolved_commit {:optional true} [:maybe :string]]
   [:dev_bundle_url  {:optional true} [:maybe :string]]
   [:manifest        {:optional true} [:maybe :any]]])

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- dev-only-plugin?
  "Returns true if the plugin was created via the dev-only flow (no git repo)."
  [plugin]
  (str/starts-with? (:repo_url plugin) "dev://local/"))

(defn- parse-repo-name
  "Extract the repository name from a git URL.
     'https://github.com/user/custom-heatmap'     -> 'custom-heatmap'
     'https://github.com/user/custom-heatmap.git' -> 'custom-heatmap'"
  [^String url]
  (-> url
      (str/replace #"\.git$" "")
      (str/split #"[/:]")
      last))

(defn- plugin->response
  "Convert a plugin record to API response format."
  [plugin]
  (assoc plugin :dev_only (dev-only-plugin? plugin)))

(defn- plugin->runtime-response
  "Convert a plugin record to the safe runtime response shape."
  [{:keys [id identifier display_name icon resolved_commit manifest dev_bundle_url]}]
  (cond-> {:id              id
           :identifier      identifier
           :display_name    display_name
           :icon            icon
           :bundle_url      (format "/api/ee/custom-viz-plugin/%d/bundle" id)
           :resolved_commit resolved_commit
           :manifest        manifest}
    dev_bundle_url (assoc :dev_bundle_url dev_bundle_url)))

;;; ------------------------------------------------ Endpoints ------------------------------------------------

(api.macros/defendpoint :post "/" :- CustomVizPluginResponse
  "Register a new custom visualization plugin from a git repository.
   Validates by fetching index.js from the repo."
  [_route-params
   _query-params
   {:keys [repo_url access_token pinned_version]} :- [:map
                                                      [:repo_url       ms/NonBlankString]
                                                      [:access_token   {:optional true} [:maybe :string]]
                                                      [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (cache/validate-repo-url! repo_url)
  (let [identifier (parse-repo-name repo_url)
        _          (api/check-400
                    (not (t2/exists? :model/CustomVizPlugin :repo_url repo_url))
                    (format "A custom visualization with repo URL \"%s\" already exists." repo_url))
        _          (api/check-400
                    (not (t2/exists? :model/CustomVizPlugin :identifier identifier))
                    (format "A custom visualization with identifier \"%s\" already exists." identifier))
        plugin (cache/fetch-and-save! {:repo_url       repo_url
                                       :access_token   access_token
                                       :identifier     identifier
                                       :pinned_version pinned_version})]
    (events/publish-event! :event/custom-viz-plugin-create {:object  plugin
                                                            :user-id api/*current-user-id*})
    (plugin->response plugin)))

(api.macros/defendpoint :post "/dev" :- CustomVizPluginResponse
  "Register a dev-only custom visualization plugin from a local dev server.
   No git repository is required — the bundle is served from the dev server URL.
   Requires custom viz plugin dev mode to be enabled."
  [_route-params
   _query-params
   {:keys [identifier dev_bundle_url]} :- [:map
                                           [:identifier     {:optional true} [:maybe ms/NonBlankString]]
                                           [:dev_bundle_url ms/NonBlankString]]]
  (api/check-superuser)
  (check-dev-mode-enabled!)
  (let [manifest     (cache/fetch-dev-manifest dev_bundle_url)
        identifier   (or identifier
                         (:name manifest)
                         (throw (ex-info (if manifest
                                           "metabase-plugin.json is missing a \"name\" field."
                                           "Could not fetch metabase-plugin.json from the dev server.")
                                         {:status-code 400})))
        sentinel-url (str "dev://local/" identifier)
        _            (api/check-400
                      (not (t2/exists? :model/CustomVizPlugin :repo_url sentinel-url))
                      (format "A custom visualization with repo URL \"%s\" already exists." sentinel-url))
        _            (api/check-400
                      (not (t2/exists? :model/CustomVizPlugin :identifier identifier))
                      (format "A custom visualization with identifier \"%s\" already exists." identifier))
        display-name (or (:name manifest) identifier)
        icon         (:icon manifest)
        version-str  (get-in manifest [:metabase :version])
        plugin       (first (t2/insert-returning-instances! :model/CustomVizPlugin
                                                            :repo_url        sentinel-url
                                                            :display_name    display-name
                                                            :identifier      identifier
                                                            :status          :active
                                                            :enabled         true
                                                            :dev_bundle_url  dev_bundle_url
                                                            :icon            icon
                                                            :manifest        manifest
                                                            :metabase_version version-str))]
    (cache/set-or-clear-dev-bundle! (:id plugin) dev_bundle_url)
    (events/publish-event! :event/custom-viz-plugin-create {:object  plugin
                                                            :user-id api/*current-user-id*})
    (plugin->response plugin)))

(api.macros/defendpoint :get "/" :- [:sequential CustomVizPluginResponse]
  "List all registered custom visualization plugins."
  []
  (api/check-superuser)
  (map plugin->response (t2/select :model/CustomVizPlugin {:order-by [[:display_name :asc]]})))

(api.macros/defendpoint :get "/list" :- [:sequential CustomVizPluginRuntimeResponse]
  "List active and enabled custom visualization plugins. Available to any authenticated user.
   Plugins with incompatible Metabase version requirements are excluded.
   Dev-only plugins are excluded when dev mode is disabled."
  []
  (let [dev-mode? (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
        plugins   (t2/select [:model/CustomVizPlugin
                              :id :identifier :display_name :icon :resolved_commit
                              :manifest :metabase_version :dev_bundle_url :repo_url]
                             :status :active
                             :enabled true
                             {:order-by [[:display_name :asc]]})]
    (->> plugins
         (filter manifest/compatible?)
         (remove #(and (not dev-mode?) (dev-only-plugin? %)))
         (map plugin->runtime-response))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Remove a custom visualization plugin and evict its cached bundle."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))]
    (t2/delete! :model/CustomVizPlugin :id id)
    (events/publish-event! :event/custom-viz-plugin-delete {:object  plugin
                                                            :user-id api/*current-user-id*})
    nil))

(api.macros/defendpoint :put "/:id" :- CustomVizPluginResponse
  "Update a custom visualization plugin."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:enabled        {:optional true} [:maybe :boolean]]
            [:access_token   {:optional true} [:maybe :string]]
            [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [existing        (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
        updates         (select-keys body [:enabled :access_token :pinned_version])
        pinned-changed? (and (contains? updates :pinned_version)
                             (not= (:pinned_version updates) (:pinned_version existing)))
        result          (if pinned-changed?
                          (cache/fetch-and-save! (merge existing updates)
                                                 (select-keys updates [:enabled]))
                          (do (when (seq updates)
                                (t2/update! :model/CustomVizPlugin id updates))
                              (t2/select-one :model/CustomVizPlugin :id id)))]
    (events/publish-event! :event/custom-viz-plugin-update {:object          result
                                                            :previous-object existing
                                                            :user-id         api/*current-user-id*})
    (plugin->response result)))

(api.macros/defendpoint :get "/:id/bundle" :- :any
  "Serve the cached JS bundle for a plugin.
   Returns application/javascript with ETag and Cache-Control headers.
   In dev mode, proxies from dev_bundle_url if set."
  [{:keys [id], :as _route-params} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   _request
   respond
   raise]
  (try
    (let [plugin  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
          dev-url (cache/resolve-dev-bundle id)
          entry   (cache/resolve-bundle plugin)]
      (if entry
        (respond {:status  200
                  :headers (cond-> {"Content-Type"                 "application/javascript"
                                    "X-Content-Type-Options"       "nosniff"
                                    "Cross-Origin-Resource-Policy" "same-origin"
                                    "Referrer-Policy"              "no-referrer"
                                    "ETag"                       (:hash entry)}
                             dev-url       (assoc "Cache-Control" "no-store")
                             (not dev-url) (assoc "Cache-Control" "public, max-age=31536000, immutable"))
                  :body    (:content entry)})
        (respond {:status  503
                  :headers {"Content-Type" "application/json"}
                  :body    "{\"error\": \"Bundle not available\"}"})))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :get "/:id/asset" :- :any
  "Serve a static image asset from the plugin's cached assets.
   The asset path is passed as a `path` query parameter (e.g. `?path=icon.svg`)
   and must match an entry in the manifest's `assets` whitelist.
   Only image files are served.
   In dev mode, proxies from the dev base URL if set."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [path]} :- [:map [:path ms/NonBlankString]]
   _body
   _request
   respond
   raise]
  (try
    (let [plugin       (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
          content-type (or (manifest/asset-content-type path)
                           (throw (ex-info "Unsupported asset type" {:status-code 404})))
          dev?         (cache/resolve-dev-bundle id)
          bytes        (cache/resolve-asset plugin path)]
      (if bytes
        (respond {:status  200
                  :headers (cond-> {"Content-Type"                 content-type
                                    "X-Content-Type-Options"       "nosniff"
                                    "Cross-Origin-Resource-Policy" "same-origin"
                                    "Referrer-Policy"              "no-referrer"}
                             dev?       (assoc "Cache-Control" "no-store")
                             (not dev?) (assoc "Cache-Control" "public, max-age=31536000, immutable"))
                  :body    (java.io.ByteArrayInputStream. bytes)})
        (respond {:status  404
                  :headers {"Content-Type" "application/json"}
                  :body    "{\"error\": \"Asset not found\"}"})))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :put "/:id/dev-url" :- [:map [:dev_bundle_url [:maybe :string]]]
  "Set or clear the dev base URL for a plugin (e.g. `http://localhost:5174`).
   The bundle is fetched from `{base}/index.js` and assets from `{base}/assets/{name}`.
   Persisted to the database so it survives server restarts.
   Requires custom viz plugin dev mode to be enabled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [dev_bundle_url]} :- [:map [:dev_bundle_url [:maybe :string]]]]
  (api/check-superuser)
  (check-dev-mode-enabled!)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (cache/set-or-clear-dev-bundle! id dev_bundle_url)
  {:dev_bundle_url (cache/resolve-dev-bundle id)})

(api.macros/defendpoint :get "/:id/dev-sse" :- :any
  "Proxy Server-Sent Events from the plugin's dev server.
   Connects to `{dev_bundle_url}/__sse` and forwards events to the browser.
   This avoids the need for a CSP exception for the dev server origin.
   Requires custom viz plugin dev mode to be enabled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (check-dev-mode-enabled!)
  (let [dev-url (cache/resolve-dev-bundle id)]
    (when-not dev-url
      (throw (ex-info "No dev server URL configured" {:status-code 404})))
    (let [sse-url (str (cache/dev-base-url dev-url) "__sse")]
      (sr/streaming-response {:content-type "text/event-stream"
                              :status       200
                              :headers      {"Cache-Control"      "no-cache"
                                             "Connection"         "keep-alive"
                                             "X-Accel-Buffering"  "no"}}
                             [^OutputStream os canceled-chan]
        (try
          (let [resp (http/get sse-url {:as               :stream
                                        :socket-timeout   0
                                        :connection-timeout 5000
                                        :headers          {"Accept" "text/event-stream"}})]
            (with-open [^InputStream is (:body resp)
                        rdr (BufferedReader. (InputStreamReader. is "UTF-8"))]
              (loop []
                (when-not (a/poll! canceled-chan)
                  (when-let [line (.readLine rdr)]
                    (.write os (.getBytes (str line "\n") "UTF-8"))
                    (.flush os)
                    (recur))))))
          (catch Exception e
            (log/debugf "SSE proxy for plugin %d ended: %s" id (ex-message e))))))))

(api.macros/defendpoint :post "/:id/refresh" :- CustomVizPluginResponse
  "Re-fetch the bundle from the git repository.
   For dev-only plugins, re-fetches the manifest from the dev server instead."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))]
    (if (dev-only-plugin? plugin)
      ;; dev-only: re-fetch manifest from dev server
      (let [dev-url  (or (cache/resolve-dev-bundle id)
                         (throw (ex-info "No dev server URL configured" {:status-code 404})))
            manifest (or (cache/fetch-dev-manifest dev-url)
                         (throw (ex-info "Failed to fetch manifest from dev server" {:status-code 502})))
            version-str  (get-in manifest [:metabase :version])]
        (t2/update! :model/CustomVizPlugin id
                    {:display_name     (or (:name manifest) (:identifier plugin))
                     :icon             (:icon manifest)
                     :manifest         manifest
                     :metabase_version version-str}))
      (cache/fetch-and-save! plugin))
    (let [result (t2/select-one :model/CustomVizPlugin :id id)]
      (events/publish-event! :event/custom-viz-plugin-update {:object          result
                                                              :previous-object plugin
                                                              :user-id         api/*current-user-id*})
      (plugin->response result))))

(def routes
  "`/api/ee/custom-viz-plugin` routes."
  (api.macros/ns-handler *ns*))
