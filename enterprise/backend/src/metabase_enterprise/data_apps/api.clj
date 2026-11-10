(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/ee/apps`: list data apps, enable or disable them, manage the groups that can read
  their collections, serve their bundles, and generate the files of their repository."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.actions :as generate.actions]
   [metabase-enterprise.data-apps.generate.queries :as generate.queries]
   [metabase-enterprise.data-apps.generate.schema :as generate.schema]
   [metabase-enterprise.data-apps.generate.util :as generate.util]
   [metabase-enterprise.data-apps.group-access :as data-app.group-access]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.server.middleware.security :as mw.security]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Constants ------------------------------------------------

(def ^:private app-ref-regex
  "A data app's ID, or, from a client that predates IDs, its slug; never a literal sub-route."
  #"(?!repo-status$|generate$|slug$)[^/]+")

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
  (let [url (data-apps.apps/repo-url)]
    {:configured (some? url)
     :url        url}))

(defn- parse-app-id
  "`x` as a data app ID when it is a positive integer string, else unchanged."
  [x]
  (if (and (string? x) (re-matches #"[1-9]\d*" x))
    (parse-long x)
    x))

(def ^:private AppRef
  "A data app's ID, or, as clients that predate IDs send it, its slug."
  [:or {:decode/api parse-app-id} ms/PositiveInt ms/NonBlankString])

(def ^:private AppRefParams
  [:map {:closed true}
   [:id AppRef]])

(defn- app-by-ref
  "The data app without its bundle whose ID or slug is `ref`, or nil."
  [ref]
  (if (int? ref)
    (data-apps.db/data-app ref)
    (data-apps.db/data-app-by-slug ref)))

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
   [:description     [:maybe :string]]
   [:version         ms/PositiveInt]
   [:outdated        :boolean]
   [:bundle_path     ms/NonBlankString]
   [:enabled         :boolean]
   [:allowed_hosts   [:sequential :string]]
   [:resource_collection_id ms/PositiveInt]
   [:bundle_hash     [:maybe :string]]
   [:created_at      :any]
   [:updated_at      :any]])

(def ^:private UpdateDataAppRequest
  [:map {:closed true}
   [:enabled :boolean]])

(def ^:private PublicDataAppResponse
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:name         ms/NonBlankString]
   [:display_name ms/NonBlankString]
   [:enabled      :boolean]
   [:outdated     :boolean]])

(def ^:private RepoStatusResponse
  [:map
   [:configured :boolean]
   [:url [:maybe :string]]])

(def ^:private GeneratedFiles
  [:sequential [:map {:closed true}
                [:path     ms/NonBlankString]
                [:contents :string]]])

(defn- kebab-case-keys
  "`x` with the keys of every map in it kebab-cased, as the SDK's camelCase keys are in Lib's test query spec."
  [x]
  (walk/postwalk #(cond-> % (map? %) (update-keys (comp keyword u/->kebab-case-en name))) x))

(defn- definitions-schema
  "Request schema for definitions by export name."
  [definition-schema]
  [:and
   {:decode/normalize (fn [definitions]
                        (cond-> definitions
                          (map? definitions)
                          (update-vals #(api.macros/decode-and-validate-params :body definition-schema %))))}
   (ms/string-keyed-map definition-schema)
   [:fn {:error/message "export names whose files have distinct paths"}
    (fn [definitions]
      (apply distinct? nil (map generate.util/resource-path (keys definitions))))]])

(def ^:private QueryDefinitions
  "The `defineQuery` exports of a data app's `metabase.queries.ts`, by export name: each one's entity ID, and its
  definition as a one-stage test query."
  (definitions-schema
    [:map {:closed true}
     [:entityId ms/NanoIdString]
     [:query    [:and {:decode/api kebab-case-keys} ::data-apps.schema/query-spec]]]))

(def ^:private ActionDefinitions
  "The `defineAction` exports of a data app's `metabase.actions.ts`, by export name: implicit actions of `kind` on a
  table."
  (definitions-schema
    [:merge
     [:map {:closed true}
      [:entityId ms/NanoIdString]]
     ::data-apps.schema/action-spec]))

(def ^:private AddGroupsRequest
  [:map {:closed true}
   [:group_ids [:sequential {:min 1 :max 100} ms/PositiveInt]]])

;;; --------------------------------------------- Repo status ---------------------------------------------

(api.macros/defendpoint :get "/repo-status" :- RepoStatusResponse
  "Status of the connected repository as it relates to data apps. Data apps are
   pulled by the remote-sync import (manual \"Pull changes\", auto-import, or
   startup); the connection is configured on the remote-sync settings page."
  []
  (api/check-superuser)
  (repo-status))

;;; ------------------------------------------------ Apps ------------------------------------------------

(defn- data-app-response
  "Return full data-app metadata, with whether the app is outdated, to superusers and only
   navigational fields to other users."
  [app]
  (cond-> (assoc app :outdated (data-app.config/outdated? app))
    (not api/*is-superuser?*) (select-keys [:id :name :display_name :enabled :outdated])))

(defn- check-not-outdated
  "Refuse an app built for an older contract than this Metabase serves with a 409 carrying
   `:error-code \"data-app-outdated\"`, so the client can show what to do. Applied where the
   contract is served: the bundle for everyone, and the metadata for non-superusers, who have no
   other use for it. Superusers still read it, to badge the app and manage its groups."
  [app]
  (when (data-app.config/outdated? app)
    (throw (ex-info (tru (str "This app was built for version {0} of data apps. Migrate it to the current "
                              "version, then rebuild and sync it again.")
                         (:version app))
                    {:status-code 409, :error-code "data-app-outdated"})))
  app)

(defn- readable-data-app-response
  "The response for `app`, read-checked, refusing an outdated app to non-superusers."
  [app]
  (data-app-response (cond-> (api/read-check app) (not api/*is-superuser?*) check-not-outdated)))

(api.macros/defendpoint :get "/" :- [:sequential [:or DataAppResponse PublicDataAppResponse]]
  "List the data apps the user can read. Disabled and outdated apps are listed only to superusers, who see them
  badged."
  []
  (->> (data-apps.db/readable-data-apps api/*current-user-id* (boolean api/*is-superuser?*))
       (remove #(and (not api/*is-superuser?*) (data-app.config/outdated? %)))
       (mapv data-app-response)))

(api.macros/defendpoint :put ["/:id" :id app-ref-regex] :- DataAppResponse
  "Enable or disable a data app. A disabled app is served to superusers only. Superusers only; anything else about an
  app changes only through a repository import."
  [{:keys [id]} :- AppRefParams
   _query-params
   {:keys [enabled]} :- UpdateDataAppRequest]
  (api/check-superuser)
  (let [app (api/check-404 (app-by-ref id))]
    (data-apps.db/update-data-app! (:id app) {:enabled enabled})
    (data-app-response (data-apps.db/data-app (:id app)))))

(api.macros/defendpoint :get "/generate/schema" :- GeneratedFiles
  "The `src/metabase.schema.ts` file of a data app: the Library's published tables, with their fields, segments and
  measures, and its metrics. Superusers only."
  []
  (api/check-superuser)
  (generate.schema/generate))

(api.macros/defendpoint :post "/generate/queries" :- GeneratedFiles
  "The YAML files of the questions a data app defines, one per `defineQuery` export in `queries`, in its collection with
  the entity ID `collection`. Nothing is saved. Superusers only."
  [_route-params
   _query-params
   {:keys [collection queries]} :- [:map {:closed true}
                                    [:collection ms/NanoIdString]
                                    [:queries QueryDefinitions]]]
  (api/check-superuser)
  (generate.queries/generate collection queries))

(api.macros/defendpoint :post "/generate/actions" :- GeneratedFiles
  "The YAML files of the implicit actions a data app defines, one per `defineAction` export in `actions`, in its
  collection with the entity ID `collection`. Nothing is saved. Superusers only."
  [_route-params
   _query-params
   {:keys [collection actions]} :- [:map {:closed true}
                                    [:collection ms/NanoIdString]
                                    [:actions ActionDefinitions]]]
  (api/check-superuser)
  (generate.actions/generate collection actions))

(def ^:private GroupPermissionWarning
  [:map
   [:group_id ms/PositiveInt]
   [:missing_tables
    [:sequential
     [:map
      [:id ms/PositiveInt]
      [:name :string]
      [:schema [:maybe :string]]
      [:database_id ms/PositiveInt]
      [:database_name :string]]]]])

(api.macros/defendpoint :get ["/:id/group-permission-warnings" :id app-ref-regex]
  :- [:sequential GroupPermissionWarning]
  "Return missing table access for the groups listed for this app."
  [{:keys [id]} :- AppRefParams]
  (api/check-superuser)
  (data-app.group-access/permission-warnings (api/check-404 (app-by-ref id))))

(def ^:private AssignedGroup
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:member_count ms/IntGreaterThanOrEqualToZero]
   [:is_tenant_group :boolean]])

(api.macros/defendpoint :get ["/:id/groups" :id app-ref-regex] :- [:sequential AssignedGroup]
  "List the groups other than Administrators that can read a data app's resource collection."
  [{:keys [id]} :- AppRefParams]
  (api/check-superuser)
  (data-app.group-access/assigned-groups (api/check-404 (app-by-ref id))))

(api.macros/defendpoint :post ["/:id/groups" :id app-ref-regex] :- [:sequential AssignedGroup]
  "Grant a batch of internal or tenant groups read access to a data app's resource collection atomically."
  [{:keys [id]} :- AppRefParams
   _query-params
   {group-ids :group_ids} :- AddGroupsRequest]
  (api/check-superuser)
  (data-app.group-access/add-groups! (api/check-404 (app-by-ref id)) group-ids))

(api.macros/defendpoint :delete ["/:id/groups/:group-id" :id app-ref-regex] :- :nil
  "Revoke a group's access to a data app's resource collection."
  [{:keys [id group-id]} :- [:merge AppRefParams [:map {:closed true} [:group-id ms/PositiveInt]]]]
  (api/check-superuser)
  (data-app.group-access/remove-group! (api/check-404 (app-by-ref id)) group-id))

(api.macros/defendpoint :get ["/:id" :id app-ref-regex] :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single data app, disabled ones to superusers only."
  [{:keys [id]} :- AppRefParams]
  (readable-data-app-response (app-by-ref id)))

(api.macros/defendpoint :get "/slug/:slug" :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single data app by its slug, disabled ones to superusers only. A data app's iframe looks up its
  app's ID here."
  {:scope api-scope/data-app}
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (readable-data-app-response (data-apps.db/data-app-by-slug slug)))

(api.macros/defendpoint :get ["/:id/bundle" :id app-ref-regex] :- :any
  "Serve the cached JS bundle and its CSP for a single data app, disabled ones to superusers only.
   Honors `If-None-Match` against the content-hash ETag with a 304."
  {:scope api-scope/data-app}
  [{:keys [id]} :- AppRefParams
   _query-params
   _body
   request
   respond
   raise]
  (try
    (let [row  (check-not-outdated (api/read-check (app-by-ref id)))
          hash (:bundle_hash row)
          etag (some->> hash (format "\"%s\""))]
      (cond
        (and hash (contains? (if-none-match-hashes (get-in request [:headers "if-none-match"])) hash))
        ;; 304 carries only the cacheable headers (Cache-Control) + ETag — never
        ;; Content-Type or a body, per RFC 9110 §15.4.5.
        (respond {:status 304, :headers {"Cache-Control" "no-cache", "ETag" etag}})

        :else
        (let [^bytes bundle (data-apps.db/data-app-bundle (:id row))]
          (if (and bundle (pos? (alength bundle)))
            (respond {:status  200
                      :headers (-> bundle-response-headers
                                   (assoc "X-Metabase-Data-App-Allowed-Hosts"
                                          (json/encode (:allowed_hosts row))
                                          "X-Metabase-Data-App-Content-Security-Policy"
                                          (mw.security/embedded-data-app-content-security-policy (:allowed_hosts row)))
                                   (cond-> etag (assoc "ETag" etag)))
                      :body    (ByteArrayInputStream. bundle)})
            (respond {:status  404
                      :headers {"Content-Type" "application/json"}
                      :body    "{\"error\":\"This app has no bundle yet\"}"})))))
    (catch Throwable e
      (raise e))))

(def routes
  "`/api/ee/apps` routes."
  (api.macros/ns-handler *ns* +auth))
