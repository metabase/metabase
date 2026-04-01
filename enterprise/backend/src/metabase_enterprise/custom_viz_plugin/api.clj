(ns metabase-enterprise.custom-viz-plugin.api
  "/api/ee/custom-viz-plugin endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.server.streaming-response :as sr]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedReader InputStream InputStreamReader OutputStream)
   (java.net HttpURLConnection URI)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- In-memory dev bundle URLs -----------------------------------------

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private CustomVizPluginResponse
  [:map
   [:id              ms/PositiveInt]
   [:repo_url        ms/NonBlankString]
   [:display_name    ms/NonBlankString]
   [:identifier      ms/NonBlankString]
   [:status          [:enum "pending" "active" "error"]]
   [:enabled         :boolean]
   [:icon            {:optional true} [:maybe :string]]
   [:error_message   {:optional true} [:maybe :string]]
   [:pinned_version  {:optional true} [:maybe :string]]
   [:resolved_commit {:optional true} [:maybe :string]]
   [:dev_bundle_url  {:optional true} [:maybe :string]]
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

(defn- parse-repo-name
  "Extract the repository name from a git URL.
   E.g., 'https://github.com/user/custom-heatmap' -> 'custom-heatmap'
         'https://github.com/user/custom-heatmap.git' -> 'custom-heatmap'"
  [^String url]
  (-> url
      (str/replace #"\.git$" "")
      (str/split #"/")
      last))

;; TODO: this should be guarded automatically through a custom mi/to-json defmethod
(defn- strip-token
  "Remove access_token from plugin map before returning to client."
  [plugin]
  (dissoc plugin :access_token))

(defn- parse-manifest-json
  "Parse the manifest JSON string stored in the DB into a map for the response."
  [manifest-str]
  (when manifest-str
    (try
      (json/decode+kw manifest-str)
      (catch Exception _ nil))))

(defn- plugin->response
  "Convert a plugin record to API response format (keyword status -> string)."
  [plugin]
  (-> plugin
      strip-token
      (update :status name)
      (update :manifest parse-manifest-json)
      (assoc :dev_bundle_url (cache/resolve-dev-bundle (:id plugin)))))

(defn- plugin->runtime-response
  "Convert a plugin record to the safe runtime response shape."
  [{:keys [id identifier display_name icon resolved_commit manifest]}]
  (let [dev-url (cache/resolve-dev-bundle id)]
    (cond-> {:id              id
             :identifier      identifier
             :display_name    display_name
             :icon            icon
             :bundle_url      (format "/api/ee/custom-viz-plugin/%d/bundle" id)
             :resolved_commit resolved_commit
             :manifest        (parse-manifest-json manifest)}
      dev-url (assoc :dev_bundle_url dev-url))))

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
  (let [identifier (parse-repo-name repo_url)
        plugin     (first (t2/insert-returning-instances! :model/CustomVizPlugin
                                                          :repo_url        repo_url
                                                          :access_token    access_token
                                                          :display_name    identifier
                                                          :identifier      identifier
                                                          :status          :pending
                                                          :pinned_version  pinned_version))]
    ;; fetch bundle synchronously — validates the repo is accessible
    ;; and updates display_name/icon from manifest
    (cache/fetch-and-update! plugin)
    ;; re-read to get updated status
    (plugin->response (t2/select-one :model/CustomVizPlugin :id (:id plugin)))))

(api.macros/defendpoint :get "/" :- [:sequential CustomVizPluginResponse]
  "List all registered custom visualization plugins."
  []
  (api/check-superuser)
  (map plugin->response (t2/select :model/CustomVizPlugin {:order-by [[:display_name :asc]]})))

(api.macros/defendpoint :get "/list" :- [:sequential CustomVizPluginRuntimeResponse]
  "List active and enabled custom visualization plugins. Available to any authenticated user.
   Plugins with incompatible Metabase version requirements are excluded."
  []
  (let [plugins (t2/select [:model/CustomVizPlugin
                            :id :identifier :display_name :icon :resolved_commit
                            :manifest :metabase_version]
                           :status :active
                           :enabled true
                           {:order-by [[:display_name :asc]]})]
    (->> plugins
         (filter manifest/compatible?)
         (map plugin->runtime-response))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Remove a custom visualization plugin and evict its cached bundle."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (t2/delete! :model/CustomVizPlugin :id id)
  nil)

(api.macros/defendpoint :put "/:id" :- CustomVizPluginResponse
  "Update a custom visualization plugin."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:enabled        {:optional true} [:maybe :boolean]]
            [:access_token   {:optional true} [:maybe :string]]
            [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [existing    (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
        updates    (select-keys body [:enabled :access_token :pinned_version])]
    (when (seq updates)
      (t2/update! :model/CustomVizPlugin id updates))
    (when (and (contains? updates :pinned_version)
               (not= (:pinned_version updates) (:pinned_version existing)))
      (let [updated-plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (cache/fetch-and-update! updated-plugin {:force? true}))))
  (plugin->response (t2/select-one :model/CustomVizPlugin :id id)))

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
                  :headers (cond-> {"Content-Type" "application/javascript"
                                    "ETag"         (:hash entry)}
                             dev-url     (assoc "Cache-Control" "no-store")
                             (not dev-url) (assoc "Cache-Control" "public, max-age=31536000, immutable"))
                  :body    (:content entry)})
        (respond {:status 503
                  :headers {"Content-Type" "application/json"}
                  :body   "{\"error\": \"Bundle not available\"}"})))
    (catch Throwable e
      (raise e))))

(defn- asset-content-type
  "Return the MIME content type for an allowed asset file, or nil if not recognized.
   Allows image files and JSON files (for locale translations)."
  [^String path]
  (cond
    (str/ends-with? path ".json")
    "application/json"

    :else
    (let [ct (java.net.URLConnection/guessContentTypeFromName path)]
      (when (and ct (str/starts-with? ct "image/"))
        ct))))

(defn- validate-asset-path
  "Validate that an asset path is a simple filename (no directory traversal).
   Returns the normalized path or throws on invalid input."
  ^String [^String raw-path]
  (let [root     (.toPath (java.io.File. "/"))
        resolved (.normalize (.resolve root raw-path))
        normalized (str (.relativize root resolved))]
    (when (or (str/blank? normalized)
              (not (.startsWith resolved root)))
      (throw (ex-info "Invalid asset path" {:status-code 400 :path raw-path})))
    normalized))

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
    (let [asset-path   (validate-asset-path path)
          content-type (asset-content-type asset-path)]
      (when-not content-type
        (throw (ex-info "Unsupported asset type" {:status-code 404})))
      (let [_plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
            dev?    (cache/resolve-dev-bundle id)
            bytes   (cache/resolve-asset id asset-path)]
        (if bytes
          (respond {:status  200
                    :headers (cond-> {"Content-Type" content-type}
                               dev?       (assoc "Cache-Control" "no-store")
                               (not dev?) (assoc "Cache-Control" "public, max-age=31536000, immutable"))
                    :body    (java.io.ByteArrayInputStream. bytes)})
          (respond {:status  404
                    :headers {"Content-Type" "application/json"}
                    :body    "{\"error\": \"Asset not found\"}"}))))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :put "/:id/dev-url" :- [:map [:dev_bundle_url [:maybe :string]]]
  "Set or clear the dev base URL for a plugin (e.g. `http://localhost:5174`).
   The bundle is fetched from `{base}/index.js` and assets from `{base}/assets/{name}`.
   Persisted to the database so it survives server restarts."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [dev_bundle_url]} :- [:map [:dev_bundle_url [:maybe :string]]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (cache/set-or-clear-dev-bundle! id dev_bundle_url)
  {:dev_bundle_url (cache/resolve-dev-bundle id)})

(api.macros/defendpoint :get "/:id/dev-sse" :- :any
  "Proxy Server-Sent Events from the plugin's dev server.
   Connects to `{dev_bundle_url}/__sse` and forwards events to the browser.
   This avoids the need for a CSP exception for the dev server origin."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
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
        (let [uri  (URI. sse-url)
              conn ^HttpURLConnection (.openConnection (.toURL uri))]
          (.setRequestMethod conn "GET")
          (.setRequestProperty conn "Accept" "text/event-stream")
          (.setConnectTimeout conn 5000)
          (.setReadTimeout conn 0)
          (try
            (with-open [^InputStream is (.getInputStream conn)
                        rdr (BufferedReader. (InputStreamReader. is "UTF-8"))]
              (loop []
                (when-not (a/poll! canceled-chan)
                  (when-let [line (.readLine rdr)]
                    (.write os (.getBytes (str line "\n") "UTF-8"))
                    (.flush os)
                    (recur)))))
            (catch Exception e
              (log/debugf "SSE proxy for plugin %d ended: %s" id (ex-message e)))
            (finally
              (.disconnect conn))))))))

(api.macros/defendpoint :post "/:id/refresh" :- CustomVizPluginResponse
  "Re-fetch the bundle from the git repository."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))]
    (cache/fetch-and-update! plugin {:force? true})
    (plugin->response (t2/select-one :model/CustomVizPlugin :id id))))

(def routes
  "`/api/ee/custom-viz-plugin` routes."
  (api.macros/ns-handler *ns*))
