(ns metabase.custom-viz-plugin.api
  "/api/custom-viz-plugin endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.custom-viz-plugin.cache :as cache]
   [metabase.custom-viz-plugin.git :as git]
   [metabase.custom-viz-plugin.models.custom-viz-plugin]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private CustomVizPluginResponse
  [:map
   [:id            ms/PositiveInt]
   [:repo_url      ms/NonBlankString]
   [:display_name  ms/NonBlankString]
   [:identifier    ms/NonBlankString]
   [:status        [:enum "pending" "active" "error"]]
   [:enabled       :boolean]
   [:icon          {:optional true} [:maybe :string]]
   [:error_message {:optional true} [:maybe :string]]
   [:pinned_version  {:optional true} [:maybe :string]]
   [:resolved_commit {:optional true} [:maybe :string]]
   [:created_at    :any]
   [:updated_at    :any]])

(def ^:private CustomVizPluginRuntimeResponse
  [:map
   [:id           ms/PositiveInt]
   [:identifier   ms/NonBlankString]
   [:display_name ms/NonBlankString]
   [:icon         {:optional true} [:maybe :string]]
   [:bundle_url   ms/NonBlankString]])

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- strip-token
  "Remove access_token from plugin map before returning to client."
  [plugin]
  (dissoc plugin :access_token))

(defn- plugin->response
  "Convert a plugin record to API response format (keyword status -> string)."
  [plugin]
  (-> plugin
      strip-token
      (update :status name)))

(defn- plugin->runtime-response
  "Convert a plugin record to the safe runtime response shape."
  [{:keys [id identifier display_name icon]}]
  {:id           id
   :identifier   identifier
   :display_name display_name
   :icon         icon
   :bundle_url   (format "/api/custom-viz-plugin/%d/bundle" id)})

;;; ------------------------------------------------ Endpoints ------------------------------------------------

(api.macros/defendpoint :post "/" :- CustomVizPluginResponse
  "Register a new custom visualization plugin from a git repository.
   Validates by fetching index.js from the repo."
  [_route-params
   _query-params
   {:keys [repo_url display_name icon access_token pinned_version]} :- [:map
                                                                        [:repo_url       ms/NonBlankString]
                                                                        [:display_name   ms/NonBlankString]
                                                                        [:icon           {:optional true} [:maybe :string]]
                                                                        [:access_token   {:optional true} [:maybe :string]]
                                                                        [:pinned_version {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (let [identifier (git/parse-repo-name repo_url)
        plugin     (first (t2/insert-returning-instances! :model/CustomVizPlugin
                                                          :repo_url        repo_url
                                                          :access_token    access_token
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
  "List active and enabled custom visualization plugins. Available to any authenticated user."
  []
  (map plugin->runtime-response
       (t2/select [:model/CustomVizPlugin :id :identifier :display_name :icon]
                  :status :active
                  :enabled true
                  {:order-by [[:display_name :asc]]})))

(api.macros/defendpoint :delete "/:id"
  "Remove a custom visualization plugin and evict its cached bundle."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
  (cache/evict! id)
  (t2/delete! :model/CustomVizPlugin :id id)
  nil)

(api.macros/defendpoint :put "/:id" :- CustomVizPluginResponse
  "Update a custom visualization plugin."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:enabled       {:optional true} [:maybe :boolean]]
            [:display_name  {:optional true} [:maybe ms/NonBlankString]]
            [:icon          {:optional true} [:maybe :string]]
            [:access_token  {:optional true} [:maybe :string]]
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
   Returns application/javascript with ETag and Cache-Control headers."
  [{:keys [id], :as _route-params} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body
   _request
   respond
   raise]
  (try
    (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))
          entry  (or (cache/get-bundle id)
                     (cache/fetch-and-cache! plugin))]
      (if entry
        (respond {:status  200
                  :headers {"Content-Type"  "application/javascript"
                            "ETag"          (:hash entry)
                            "Cache-Control" "public, max-age=3600"}
                  :body    (:content entry)})
        (respond {:status 503
                  :headers {"Content-Type" "application/json"}
                  :body   "{\"error\": \"Bundle not available\"}"})))
    (catch Throwable e
      (raise e))))

(api.macros/defendpoint :post "/:id/refresh" :- CustomVizPluginResponse
  "Re-fetch the bundle from the git repository."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [plugin (api/check-404 (t2/select-one :model/CustomVizPlugin :id id))]
    (cache/evict! id)
    (cache/fetch-and-cache! plugin {:force? true})
    (plugin->response (t2/select-one :model/CustomVizPlugin :id id))))
