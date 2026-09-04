(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/apps`. Serves the bundles materialized by
   [[metabase-enterprise.data-apps.sync]]; see `README.md` in this directory for
   where apps come from and how the pieces fit together.

   Note: we can't use `/app/...` for the frontend or `/api/app/...` for the API
   because Metabase's server reserves `/app/*` for serving static assets (see
   `metabase.server.routes/static-files-handler`)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
   [metabase-enterprise.data-apps.user-access :as data-app.user-access]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Constants ------------------------------------------------

;; Slug must not collide with the literal `repo-status`/`sandbox-host` sub-routes.
(def ^:private slug-regex #"(?!repo-status$|sandbox-host$)[^/]+")

(def ^:private bundle-response-headers
  ;; `no-cache` so the browser may cache but must revalidate via
  ;; the content-hash ETag — we answer If-None-Match with 304 below.
  {"Content-Type"                 "application/javascript"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-cache"})

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- repo-status []
  (let [url (data-app.sync/repo-url)]
    {:configured (some? url)
     :url        url}))

(defn- if-none-match-hashes
  "Parse an `If-None-Match` header into the set of bare hashes it lists, dropping
   any `W/` weak prefix and surrounding quotes (handles a comma-separated list)."
  [header]
  (->> (some-> header (str/split #"\s*,\s*"))
       (map #(-> % (str/replace-first #"^W/" "") (str/replace #"^\"|\"$" "")))
       set))

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private DataAppResponse
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:display_name    ms/NonBlankString]
   [:bundle_path     ms/NonBlankString]
   [:enabled         :boolean]
   [:allowed_hosts   [:sequential :string]]
   [:resource_collection_id [:maybe ms/PositiveInt]]
   [:permission_group_id    [:maybe ms/PositiveInt]]
   [:table_ids       [:sequential ms/PositiveInt]]
   [:has_user_permission_warnings {:optional true} :boolean]
   [:bundle_hash     [:maybe :string]]
   [:last_synced_sha [:maybe :string]]
   [:last_synced_at  [:maybe :any]]
   [:sync_error      [:maybe :string]]
   [:created_at      :any]
   [:updated_at      :any]])

(def ^:private PublicDataAppResponse
  [:map {:closed true}
   [:name         ms/NonBlankString]
   [:display_name ms/NonBlankString]])

(def ^:private RepoStatusResponse
  [:map
   [:configured :boolean]
   [:url [:maybe :string]]])

(def ^:private QuerySource
  [:map
   [:type :string]
   [:id ms/PositiveInt]])

(def ^:private QueryDefinition
  [:map {:closed false}
   [:stages [:sequential {:min 1}
             [:map {:closed false}
              [:source QuerySource]]]]])

(def ^:private MetricResponse
  [:map {:closed true}
   [:id                     ms/PositiveInt]
   [:name                   ms/NonBlankString]
   [:type                   [:enum :metric]]
   [:collection_id          [:maybe ms/PositiveInt]]
   [:dataset_query          ms/Map]
   [:database_id            ms/PositiveInt]
   [:display                [:maybe [:or :keyword :string]]]
   [:visualization_settings [:maybe ms/Map]]
   [:description            [:maybe :string]]])

(def ^:private QueryResolutionResponse
  [:map
   [:database_id ms/PositiveInt]
   [:dataset_query ms/Map]
   [:table_ids [:sequential ms/PositiveInt]]
   [:metrics [:sequential MetricResponse]]])

(def ^:private TableDependenciesRequest
  [:map {:closed true}
   [:table_ids [:sequential {:distinct true} ms/PositiveInt]]])

(def ^:private PermissionWarningsRequest
  [:map {:closed true}
   [:user_ids [:sequential {:min 1 :max 100 :distinct true} ms/PositiveInt]]])

(def ^:private MissingTable
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:name ms/NonBlankString]
   [:schema [:maybe :string]]
   [:database_id ms/PositiveInt]
   [:database_name ms/NonBlankString]])

(def ^:private PermissionWarning
  [:map {:closed true}
   [:user_id ms/PositiveInt]
   [:missing_tables [:sequential MissingTable]]])

;;; --------------------------------------------- Repo status ---------------------------------------------

(api.macros/defendpoint :get "/repo-status" :- RepoStatusResponse
  "Status of the connected repository as it relates to data apps. Data apps are
   pulled by the remote-sync import (manual \"Pull changes\", auto-import, or
   startup); the connection is configured on the remote-sync settings page."
  []
  (api/check-superuser)
  (repo-status))

;;; --------------------------------------------- Sandbox host ---------------------------------------------

(def ^:private sandbox-host-html
  "Empty document loaded as the Near-Membrane realm iframe. It only needs to exist and carry the
   CSP below; the membrane populates the realm itself."
  "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>")

(def ^:private sandbox-host-csp
  "CSP for the sandbox realm document ONLY.

   `'unsafe-eval'` is what Near-Membrane needs to evaluate the app bundle inside the realm.
   Serving the realm from its own document is what lets the data-app document drop that grant:
   an `about:blank` realm would instead inherit the data-app document's CSP, forcing
   `'unsafe-eval'` there and handing an attacker `eval`/`Function` in the host realm.

   `default-src 'none'` gives the realm no network of its own — unlike the inherited case, where
   it would pick up the data-app document's `connect-src` (which includes the instance origin)."
  (str "default-src 'none'; "
       "script-src 'unsafe-eval'; "
       "frame-ancestors 'self';"))

(api.macros/defendpoint :get "/sandbox-host" :- :any
  "Serve the document used as the `src` of the Near-Membrane realm iframe, carrying a
   per-document CSP that confines `'unsafe-eval'` to that realm. See [[sandbox-host-csp]]."
  []
  {:status  200
   :headers {"Content-Type"                 "text/html; charset=utf-8"
             "Content-Security-Policy"      sandbox-host-csp
             "X-Frame-Options"              "SAMEORIGIN"
             "X-Content-Type-Options"       "nosniff"
             "Cross-Origin-Resource-Policy" "same-origin"
             "Referrer-Policy"              "no-referrer"
             "Cache-Control"                "public, max-age=60"}
   :body    sandbox-host-html})

;;; ------------------------------------------------ Apps ------------------------------------------------

(defn- data-app-response
  "Return full data-app metadata to superusers and only navigational fields to other users."
  [app]
  (if api/*is-superuser?*
    app
    (select-keys app [:name :display_name])))

(defn- data-app-list-response
  [warning-group-ids app]
  (cond-> (data-app-response app)
    api/*is-superuser?*
    (assoc :has_user_permission_warnings
           (contains? warning-group-ids (:permission_group_id app)))))

(defn- read-check-data-app
  "Check whether the current user can access a data app. Viewing requires read access to the app's
   resource collection. An app with no linked resource collection has not been published yet: it is
   not viewable by anyone through this endpoint (an admin must publish it first), signalled with a
   409 so the client can show a dedicated \"not published\" screen rather than leaking metadata or
   the bundle to every signed-in user."
  [app]
  (api/read-check app)
  (if-let [collection-id (:resource_collection_id app)]
    (api/read-check :model/Collection collection-id)
    (throw (ex-info (tru "This data app has not been published yet.")
                    {:status-code 409})))
  app)

(api.macros/defendpoint :get "/" :- [:sequential [:or DataAppResponse PublicDataAppResponse]]
  "List the data apps provided by the connected repository. Pass `available=true`
   to return only enabled apps without sync errors."
  [_route-params
   {:keys [available]} :- [:map [:available {:optional true} [:maybe :boolean]]]]
  (let [apps (->> (data-app/select-non-blob (cond-> {:order-by [[:display_name :asc]]}
                                              available (assoc :where [:and
                                                                       [:= :enabled true]
                                                                       [:= :sync_error nil]])))
                  (mapv api/read-check))
        warning-group-ids (when api/*is-superuser?*
                            (data-app.user-access/groups-with-permission-warnings apps))]
    (mapv (partial data-app-list-response warning-group-ids) apps)))

;; NOTE on the `slug-regex` constraint: the default path-param matcher allows
;; slashes inside a segment, so `/:slug` would otherwise swallow `/x/bundle`.
;; The regex also excludes the literal `repo-status` sub-route above.
(api.macros/defendpoint :put ["/:slug" :slug slug-regex] :- DataAppResponse
  "Enable or disable a single data app. Disabled apps are not served."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   {:keys [enabled]} :- [:map [:enabled :boolean]]]
  (api/check-superuser)
  (let [app (api/check-404 (data-app/select-one-non-blob :name slug))]
    (t2/update! :model/DataApp :id (:id app) {:enabled enabled})
    (data-app/select-one-non-blob :id (:id app))))

(api.macros/defendpoint :delete ["/:slug" :slug slug-regex] :- :nil
  "Remove a single data app (its row and cached bundle). Intended for clearing out
   apps left behind by a repository that is no longer connected: while a repo is
   connected, an app still in it is re-materialized by the next sync, and one no
   longer in it is pruned by that sync anyway."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (api/check-superuser)
  ;; `t2/delete!` returns the row count; a 0 means the slug wasn't there → 404.
  (api/check-404 (pos? (t2/delete! :model/DataApp :name slug)))
  ;; a `nil` body is rendered as a 204; matches the `:- :nil` response schema
  ;; above (returning `generic-204-no-content` would fail that validation).
  nil)

(api.macros/defendpoint :put ["/:slug/table-dependencies" :slug slug-regex] :- DataAppResponse
  "Store the tables used by the resources from a successful data app resource synchronization."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   {table-ids :table_ids} :- TableDependenciesRequest]
  (api/check-superuser)
  (let [app       (api/check-404 (data-app/select-one-non-blob :name slug))
        table-ids (vec (sort table-ids))]
    (api/check-400 (= (set table-ids)
                      (if (seq table-ids)
                        (t2/select-pks-set :model/Table :id [:in table-ids])
                        #{}))
                   (tru "One or more tables do not exist."))
    (t2/update! :model/DataApp :id (:id app) {:table_ids table-ids})
    (data-app/select-one-non-blob :id (:id app))))

(api.macros/defendpoint :post ["/:slug/user-permission-warnings" :slug slug-regex]
  :- [:sequential PermissionWarning]
  "Return warnings for users who cannot access every table used by a data app."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   {user-ids :user_ids} :- PermissionWarningsRequest]
  (api/check-superuser)
  (let [app   (api/check-404 (data-app/select-one-non-blob :name slug))
        users (t2/select [:model/User :id :is_superuser :is_active :tenant_id] :id [:in user-ids])]
    (api/check-404 (= (count users) (count user-ids)))
    (api/check-400 (every? :is_active users)
                   (tru "Deactivated users cannot be added to data apps."))
    (api/check-400 (every? (comp nil? :tenant_id) users)
                   (tru "Tenant users cannot be added to data apps."))
    (data-app.user-access/permission-warnings (:table_ids app) users)))

(defn- referenced-metrics
  "Return direct metric references."
  [query]
  (let [metric-ids (lib/all-source-card-ids query)
        metrics    (if (seq metric-ids)
                     (t2/select :model/Card :id [:in metric-ids] :type "metric")
                     [])]
    (mapv #(update (select-keys % [:id :name :type :collection_id :dataset_query
                                   :database_id :display :visualization_settings :description])
                   :dataset_query
                   lib/prepare-for-serialization)
          (sort-by :id metrics))))

(api.macros/defendpoint :post ["/:slug/query" :slug slug-regex] :- QueryResolutionResponse
  "Resolve an authored data-app query definition into a serializable Metabase query."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   query-def :- QueryDefinition]
  (api/check-superuser)
  (api/check-404 (data-app/select-one-non-blob :name slug))
  (let [{source-type :type, table-id :id} (get-in query-def [:stages 0 :source])
        _           (api/check-400 (= (keyword source-type) :table)
                                   "Data app query definitions must use a table source.")
        database-id (api/check-404 (t2/select-one-fn :db_id :model/Table :id table-id))
        query        (lib/test-query (lib-be/application-database-metadata-provider database-id) query-def)]
    {:database_id database-id
     :dataset_query (lib/prepare-for-serialization query)
     :table_ids     (->> (concat (lib/all-source-table-ids query)
                                 (lib/all-implicitly-joined-table-ids query))
                         set
                         sort
                         vec)
     :metrics       (referenced-metrics query)}))

(api.macros/defendpoint :post ["/:slug/draft" :slug slug-regex] :- DataAppResponse
  "Create or reuse a data app draft before its first repository import."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-400 (data-app.config/valid-slug? slug)
                 "Data app draft slugs must use lowercase letters, numbers, and dashes.")
  (data-app.sync/ensure-draft! slug)
  (data-app/select-one-non-blob :name slug))

(api.macros/defendpoint :get ["/:slug" :slug slug-regex] :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single enabled data app by its slug."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (data-app-response (read-check-data-app (data-app/select-one-non-blob :name slug :enabled true))))

(api.macros/defendpoint :get ["/:slug/bundle" :slug slug-regex] :- :any
  "Serve the cached JS bundle for a single enabled data app by slug. Honors
   `If-None-Match` against the content-hash ETag with a 304."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   _body
   request
   respond
   raise]
  (try
    (let [row  (read-check-data-app (data-app/select-one-non-blob :name slug :enabled true))
          hash (:bundle_hash row)
          etag (some->> hash (format "\"%s\""))]
      (cond
        (and hash (contains? (if-none-match-hashes (get-in request [:headers "if-none-match"])) hash))
        ;; 304 carries only the cacheable headers (Cache-Control) + ETag — never
        ;; Content-Type or a body, per RFC 9110 §15.4.5.
        (respond {:status 304, :headers {"Cache-Control" "no-cache", "ETag" etag}})

        :else
        (let [^bytes bundle (t2/select-one-fn :bundle :model/DataApp :id (:id row))]
          (if (and bundle (pos? (alength bundle)))
            (respond {:status  200
                      :headers (-> bundle-response-headers
                                   ;; JSON array of origins the sandboxed bundle may fetch/XHR; the
                                   ;; iframe reads this to configure its Near-Membrane fetch allowlist.
                                   (assoc "X-Metabase-Data-App-Allowed-Hosts"
                                          (json/encode (:allowed_hosts row)))
                                   (cond-> etag (assoc "ETag" etag)))
                      :body    (ByteArrayInputStream. bundle)})
            (respond {:status  404
                      :headers {"Content-Type" "application/json"}
                      :body    "{\"error\":\"Bundle not synced yet\"}"})))))
    (catch Throwable e
      (raise e))))

(def routes
  "`/api/apps` routes."
  (api.macros/ns-handler *ns* +auth))
