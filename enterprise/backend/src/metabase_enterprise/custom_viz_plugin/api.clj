(ns metabase-enterprise.custom-viz-plugin.api
  "/api/ee/custom-viz-plugin endpoints."
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.server.streaming-response :as sr]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedReader File InputStream InputStreamReader OutputStream)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Dev-mode guard ------------------------------------------------

(defn- check-dev-mode-enabled!
  "Throws a 403 if dev mode is not enabled via MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED."
  []
  (api/check (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
             [403 "Custom visualization plugin dev mode is not enabled."]))

;;; ------------------------------------------------ Upload guard ------------------------------------------------

(defn- check-upload!
  "Validate an incoming multipart `file` part before we spend any IO reading it.
   Rejects oversized uploads with 413 using `:size` (populated by Ring from the
   bytes it actually buffered, not a client header) and rejects missing files with
   400. Returns the `java.io.File` tempfile."
  ^File [file]
  (let [tempfile (:tempfile file)]
    (when-not (instance? File tempfile)
      (throw (ex-info "No file provided" {:status-code 400})))
    (when (> (:size file) cache/max-bundle-bytes)
      (throw (ex-info (format "Bundle must be less than %dMB." cache/max-bundle-mib)
                      {:status-code 413})))
    tempfile))

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private CustomVizPluginResponse
  [:map
   [:id              ms/PositiveInt]
   [:display_name    ms/NonBlankString]
   [:identifier      ms/NonBlankString]
   [:status          [:enum :active :error]]
   [:enabled         :boolean]
   [:icon            {:optional true} [:maybe :string]]
   [:error_message   {:optional true} [:maybe :string]]
   [:bundle_hash     {:optional true} [:maybe :string]]
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
   [:bundle_hash     {:optional true} [:maybe :string]]
   [:dev_bundle_url  {:optional true} [:maybe :string]]
   [:manifest        {:optional true} [:maybe :any]]])

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- dev-only-plugin?
  "Returns true if the plugin has no uploaded bundle and is served from a dev URL."
  [plugin]
  (nil? (:bundle_hash plugin)))

(defn- plugin->response
  "Convert a plugin record to API response format."
  [plugin]
  (-> plugin
      (assoc :dev_only (dev-only-plugin? plugin))
      ;; never expose the raw bundle bytes
      (dissoc :bundle)))

(defn- plugin->runtime-response
  "Convert a plugin record to the safe runtime response shape."
  [{:keys [id identifier display_name icon bundle_hash manifest dev_bundle_url]}]
  (cond-> {:id           id
           :identifier   identifier
           :display_name display_name
           :icon         icon
           :bundle_url   (format "/api/ee/custom-viz-plugin/%d/bundle" id)
           :bundle_hash  bundle_hash
           :manifest     manifest}
    dev_bundle_url (assoc :dev_bundle_url dev_bundle_url)))

;; Every selector except the raw `/bundle` serve path wants the full plugin row
;; *without* the bundle blob — loading a multi-MB archive on every list / update
;; would be wasteful. These helpers drive that: they target the same column set
;; as a normal `t2/select` but omit `:bundle`.

(def ^:private non-blob-columns
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(defn- select-one-plugin
  "Like `t2/select-one` on `:model/CustomVizPlugin`, but excludes the bundle blob."
  [& conditions]
  (apply t2/select-one (into [:model/CustomVizPlugin] non-blob-columns) conditions))

(defn- select-plugins
  "Like `t2/select` on `:model/CustomVizPlugin`, but excludes the bundle blob."
  [& conditions]
  (apply t2/select (into [:model/CustomVizPlugin] non-blob-columns) conditions))

;;; ------------------------------------------------ Endpoints ------------------------------------------------

(api.macros/defendpoint :post "/" :- CustomVizPluginResponse
  "Register a new custom visualization plugin from an uploaded tar.gz bundle.

  The archive must contain `metabase-plugin.json` at the root and
  `dist/index.js` for the JS bundle, plus any whitelisted assets under
  `dist/assets/`. The plugin's `identifier` is taken from the manifest's `name`
  field."
  {:multipart true}
  [_route-params
   _query-params
   _body
   {{file "file"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass File)]]]]]]]
  (api/check-superuser)
  (let [tempfile (check-upload! file)]
    (try
      (let [bundle-bytes (Files/readAllBytes (.toPath tempfile))
            validated    (cache/validate-bundle! bundle-bytes)
            identifier   (get-in validated [:manifest :name])
            _            (api/check-400
                          (not (t2/exists? :model/CustomVizPlugin :identifier identifier))
                          (format "A custom visualization with identifier \"%s\" already exists." identifier))
            plugin       (cache/insert-bundle! identifier validated)]
        (events/publish-event! :event/custom-viz-plugin-create {:object  plugin
                                                                :user-id api/*current-user-id*})
        (plugin->response (dissoc plugin :bundle)))
      (finally
        (try (.delete tempfile) (catch Exception _))))))

(api.macros/defendpoint :post "/dev" :- CustomVizPluginResponse
  "Register a dev-only custom visualization plugin from a local dev server.
   No bundle upload is required — files are served from the dev server URL.
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
        _            (api/check-400
                      (not (t2/exists? :model/CustomVizPlugin :identifier identifier))
                      (format "A custom visualization with identifier \"%s\" already exists." identifier))
        display-name (or (:name manifest) identifier)
        icon         (:icon manifest)
        version-str  (get-in manifest [:metabase :version])
        plugin       (first (t2/insert-returning-instances! :model/CustomVizPlugin
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
  (->> (select-plugins {:order-by [[:display_name :asc]]})
       (mapv (comp plugin->response api/read-check))))

(api.macros/defendpoint :get "/list" :- [:sequential CustomVizPluginRuntimeResponse]
  "List active and enabled custom visualization plugins. Available to any authenticated user.
   Plugins with incompatible Metabase version requirements are excluded.
   Dev-only plugins are excluded when dev mode is disabled."
  []
  (let [dev-mode? (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
        plugins   (select-plugins :status :active
                                  :enabled true
                                  {:order-by [[:display_name :asc]]})]
    (->> plugins
         (filter manifest/compatible?)
         (remove #(and (not dev-mode?) (dev-only-plugin? %)))
         (mapv (comp plugin->runtime-response api/read-check)))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Remove a custom visualization plugin and evict its on-disk cache."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/write-check (select-one-plugin :id id))]
    (t2/delete! :model/CustomVizPlugin :id id)
    (cache/purge-plugin-cache! plugin)
    (events/publish-event! :event/custom-viz-plugin-delete {:object  plugin
                                                            :user-id api/*current-user-id*})
    nil))

(api.macros/defendpoint :put "/:id" :- CustomVizPluginResponse
  "Update a custom visualization plugin. Currently only `enabled` may be toggled."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:enabled {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (let [existing (api/write-check (select-one-plugin :id id))
        updates  (select-keys body [:enabled])]
    (when (seq updates)
      (t2/update! :model/CustomVizPlugin id updates))
    (let [result (select-one-plugin :id id)]
      (events/publish-event! :event/custom-viz-plugin-update {:object          result
                                                              :previous-object existing
                                                              :user-id         api/*current-user-id*})
      (plugin->response result))))

(api.macros/defendpoint :post "/:id/bundle" :- CustomVizPluginResponse
  "Replace the bundle for an existing plugin. Accepts a multipart tar.gz upload in
   the same format as the `POST /` endpoint. The manifest's `name` field must
   match the plugin's existing `identifier`."
  {:multipart true}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   {{file "file"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass File)]]]]]]]
  (api/check-superuser)
  (let [existing (api/write-check (select-one-plugin :id id))
        tempfile (check-upload! file)]
    (try
      (let [bundle-bytes (Files/readAllBytes (.toPath tempfile))
            validated    (cache/validate-bundle! bundle-bytes)
            new-name     (get-in validated [:manifest :name])]
        (api/check-400 (= new-name (:identifier existing))
                       (format "Bundle manifest \"name\" (%s) does not match the plugin's identifier (%s)."
                               new-name (:identifier existing)))
        (let [result (cache/save-bundle! existing validated)]
          (events/publish-event! :event/custom-viz-plugin-update
                                 {:object          result
                                  :previous-object existing
                                  :user-id         api/*current-user-id*})
          (plugin->response (dissoc result :bundle))))
      (finally
        (try (.delete tempfile) (catch Exception _))))))

(api.macros/defendpoint :get "/:id/bundle" :- :any
  "Serve the JS bundle for a plugin from the on-disk cache.
   Returns application/javascript with ETag and Cache-Control headers.
   In dev mode, proxies from `dev_bundle_url` if set."
  [{:keys [id], :as _route-params} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   _request
   respond
   raise]
  (try
    (let [plugin  (api/read-check (select-one-plugin :id id))
          dev-url (cache/resolve-dev-bundle id)
          entry   (cache/resolve-bundle plugin)]
      (if entry
        (respond {:status  200
                  :headers (cond-> {"Content-Type"                 "application/javascript"
                                    "X-Content-Type-Options"       "nosniff"
                                    "Cross-Origin-Resource-Policy" "same-origin"
                                    "Referrer-Policy"              "no-referrer"
                                    "ETag"                         (:hash entry)}
                             dev-url       (assoc "Cache-Control" "no-store")
                             (not dev-url) (assoc "Cache-Control" "public, max-age=31536000, immutable"))
                  :body    (:content entry)})
        (respond {:status  503
                  :headers {"Content-Type" "application/json"}
                  :body    "{\"error\": \"Bundle not available\"}"})))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :get "/:id/asset" :- :any
  "Serve a static image asset from the plugin's bundle.
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
    (let [plugin       (api/read-check (select-one-plugin :id id))
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
  (api/write-check (select-one-plugin :id id))
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
  "Re-fetch the manifest from the dev server for a dev-only plugin. For uploaded
   plugins this is a no-op — to update an upload-backed plugin, POST a new bundle
   to `/:id/bundle`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/write-check (select-one-plugin :id id))]
    (api/check-400 (dev-only-plugin? plugin)
                   "Refresh is only supported for dev-only plugins; upload a new bundle to /:id/bundle.")
    (let [dev-url      (or (cache/resolve-dev-bundle id)
                           (throw (ex-info "No dev server URL configured" {:status-code 404})))
          manifest     (or (cache/fetch-dev-manifest dev-url)
                           (throw (ex-info "Failed to fetch manifest from dev server" {:status-code 502})))
          version-str  (get-in manifest [:metabase :version])]
      (t2/update! :model/CustomVizPlugin id
                  {:display_name     (or (:name manifest) (:identifier plugin))
                   :icon             (:icon manifest)
                   :manifest         manifest
                   :metabase_version version-str})
      (let [result (select-one-plugin :id id)]
        (events/publish-event! :event/custom-viz-plugin-update {:object          result
                                                                :previous-object plugin
                                                                :user-id         api/*current-user-id*})
        (plugin->response result)))))

(def routes
  "`/api/ee/custom-viz-plugin` routes."
  (api.macros/ns-handler *ns* +auth))
