(ns metabase.custom-viz-plugin.api
  "/api/custom-viz-plugin endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.custom-viz-plugin.cache :as cache]
   [metabase.custom-viz-plugin.git :as git]
   [metabase.custom-viz-plugin.manifest :as manifest]
   [metabase.custom-viz-plugin.models.custom-viz-plugin]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- In-memory dev bundle URLs -----------------------------------------

(def ^:private dev-bundle-urls cache/dev-bundle-urls)

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
      (json/parse-string manifest-str true)
      (catch Exception _ nil))))

(defn- apply-manifest-defaults
  "Merge manifest defaults for display_name and icon into a plugin map.
   User-set (non-nil) values in the DB take precedence.
   Falls back to identifier if neither user nor manifest provides a display_name."
  [plugin parsed-manifest]
  (cond-> plugin
    (nil? (:display_name plugin))
    (assoc :display_name (or (:name parsed-manifest) (:identifier plugin)))
    (and (nil? (:icon plugin)) (:icon parsed-manifest))
    (assoc :icon (:icon parsed-manifest))))

(defn- plugin->response
  "Convert a plugin record to API response format (keyword status -> string)."
  [plugin]
  (let [parsed (parse-manifest-json (:manifest plugin))]
    (-> plugin
        strip-token
        (apply-manifest-defaults parsed)
        (update :status name)
        (assoc :manifest parsed)
        (assoc :dev_bundle_url (get @dev-bundle-urls (:id plugin))))))

(defn- plugin->runtime-response
  "Convert a plugin record to the safe runtime response shape."
  [{:keys [id identifier display_name icon resolved_commit manifest] :as plugin}]
  (let [parsed  (parse-manifest-json manifest)
        plugin  (apply-manifest-defaults plugin parsed)
        dev-url (get @dev-bundle-urls id)]
    (cond-> {:id              id
             :identifier      identifier
             :display_name    (:display_name plugin)
             :icon            (:icon plugin)
             :bundle_url      (format "/api/custom-viz-plugin/%d/bundle" id)
             :resolved_commit resolved_commit
             :manifest        parsed}
      dev-url (assoc :dev_bundle_url dev-url))))

;;; ------------------------------------------------ Endpoints ------------------------------------------------

(api.macros/defendpoint :post "/" :- CustomVizPluginResponse
  "Register a new custom visualization plugin from a git repository.
   Validates by fetching index.js from the repo."
  [_route-params
   _query-params
   {:keys [repo_url display_name icon access_token pinned_version]} :- [:map
                                                                        [:repo_url       ms/NonBlankString]
                                                                        [:display_name   {:optional true} [:maybe ms/NonBlankString]]
                                                                        [:icon           {:optional true} [:maybe :string]]
                                                                        [:access_token   {:optional true} [:maybe :string]]
                                                                        [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [identifier (git/parse-repo-name repo_url)
        plugin     (first (t2/insert-returning-instances! :model/CustomVizPlugin
                                                          :repo_url        repo_url
                                                          :access_token    access_token
                                                          ;; Store user-provided values or nil;
                                                          ;; manifest defaults are merged JIT in the API response.
                                                          :display_name    display_name
                                                          :identifier      identifier
                                                          :icon            icon
                                                          :status          :pending
                                                          :pinned_version  pinned_version))]
    ;; fetch bundle synchronously — validates the repo is accessible
    (cache/fetch-and-cache! plugin)
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
         (filter #(manifest/compatible? %))
         (map plugin->runtime-response))))

(api.macros/defendpoint :delete "/:id"
  "Remove a custom visualization plugin and evict its cached bundle."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (cache/evict! id)
  (swap! dev-bundle-urls dissoc id)
  (t2/delete! :model/CustomVizPlugin :id id)
  nil)

(api.macros/defendpoint :put "/:id" :- CustomVizPluginResponse
  "Update a custom visualization plugin."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:enabled        {:optional true} [:maybe :boolean]]
            [:display_name   {:optional true} [:maybe ms/NonBlankString]]
            [:icon           {:optional true} [:maybe :string]]
            [:access_token   {:optional true} [:maybe :string]]
            [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [existing    (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
        ;; select-keys preserves nil values (meaning "clear this field"),
        ;; while absent keys are simply not included.
        updates    (select-keys body [:enabled :display_name :icon :access_token :pinned_version])]
    (when (seq updates)
      (t2/update! :model/CustomVizPlugin id updates))
    (when (and (contains? updates :pinned_version)
               (not= (:pinned_version updates) (:pinned_version existing)))
      (let [updated-plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (cache/evict! id)
        (cache/fetch-and-cache! updated-plugin {:force? true}))))
  (plugin->response (t2/select-one :model/CustomVizPlugin :id id)))

(api.macros/defendpoint :get "/:id/bundle"
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
          dev-url (get @dev-bundle-urls id)
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

(defn- guess-content-type
  "Guess the MIME content type from a file path."
  [^String path]
  (or (java.net.URLConnection/guessContentTypeFromName path)
      "application/octet-stream"))

(api.macros/defendpoint :get "/:id/assets/*path"
  "Serve a static asset from the plugin's cached assets.
   Assets are files from the dist/assets/ directory or explicitly listed in the manifest."
  [{:keys [id path]} :- [:map [:id ms/PositiveInt] [:path ms/NonBlankString]]
   _query-params
   _body
   _request
   respond
   raise]
  (try
    (when (or (str/includes? path "..")
              (str/starts-with? path "/"))
      (throw (ex-info "Invalid asset path" {:status-code 400})))
    (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
          bytes  (cache/get-asset (:id plugin) path)]
      (if bytes
        (respond {:status  200
                  :headers {"Content-Type"  (guess-content-type path)
                            "Cache-Control" "public, max-age=31536000, immutable"}
                  :body    (java.io.ByteArrayInputStream. bytes)})
        (respond {:status  404
                  :headers {"Content-Type" "application/json"}
                  :body    "{\"error\": \"Asset not found\"}"})))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :put "/:id/dev-url"
  "Set or clear the in-memory dev bundle URL for a plugin.
   This is transient — cleared on server restart."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [dev_bundle_url]} :- [:map [:dev_bundle_url [:maybe :string]]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (if (seq dev_bundle_url)
    (swap! dev-bundle-urls assoc id dev_bundle_url)
    (swap! dev-bundle-urls dissoc id))
  {:dev_bundle_url (get @dev-bundle-urls id)})

(api.macros/defendpoint :post "/:id/refresh" :- CustomVizPluginResponse
  "Re-fetch the bundle from the git repository."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))]
    (cache/evict! id)
    (cache/fetch-and-cache! plugin {:force? true})
    (plugin->response (t2/select-one :model/CustomVizPlugin :id id))))
