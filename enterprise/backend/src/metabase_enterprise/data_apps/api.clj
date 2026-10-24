(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/ee/apps`: manage data apps and the groups that can read their collections, serve
  their bundles, and generate their typed schema."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.group-access :as data-app.group-access]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase-enterprise.data-apps.typed-schema :as data-apps.typed-schema]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
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
  (let [url (data-apps.apps/repo-url)]
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

(def ^:private CreateDataAppRequest
  [:map {:closed true}
   [:name          ::data-apps.schema/slug]
   [:display_name  {:optional true} ::data-apps.schema/display-name]
   [:description   {:optional true} ::data-apps.schema/description]
   [:version       {:optional true} ::data-apps.schema/version]
   [:bundle_path   {:optional true} ::data-apps.schema/bundle-path]
   [:allowed_hosts {:optional true} ::data-apps.schema/allowed-hosts]
   [:enabled       {:optional true} :boolean]])

(def ^:private create-defaults
  "What a new app starts with: an empty bundle, and unless its request says otherwise, the bundle path the app
  template builds to; it is enabled, like an app an import creates."
  {:bundle_path "dist/index.js"
   :bundle      ""})

(def ^:private UpdateDataAppRequest
  [:map {:closed true}
   [:enabled       {:optional true} :boolean]
   [:display_name  {:optional true} ::data-apps.schema/display-name]
   [:description   {:optional true} ::data-apps.schema/description]
   [:version       {:optional true} ::data-apps.schema/version]
   [:bundle_path   {:optional true} ::data-apps.schema/bundle-path]
   [:allowed_hosts {:optional true} ::data-apps.schema/allowed-hosts]])

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

(api.macros/defendpoint :get "/" :- [:sequential [:or DataAppResponse PublicDataAppResponse]]
  "List the data apps the user can read. Disabled and outdated apps are listed only to superusers, who see them
  badged."
  []
  (->> (data-apps.db/readable-data-apps api/*current-user-id* (boolean api/*is-superuser?*))
       (remove #(and (not api/*is-superuser?*) (data-app.config/outdated? %)))
       (mapv data-app-response)))

(defn- with-bundle
  "The DataApp `changes` with their `bundle` text as the bytes the app is served."
  [changes]
  (cond-> changes
    (contains? changes :bundle) (update :bundle data-app/file->bundle)))

(defn- write-check-data-app
  "The DataApp named `slug` without its bundle, checked for existence and write permissions."
  [slug]
  (api/write-check (api/check-404 (data-apps.db/data-app-by-slug slug))))

(defn- check-editable!
  "Throws a 403 when `app` is read-only under remote sync."
  [app]
  (api/check-403 (remote-sync/model-editable? :model/DataApp app)))

(api.macros/defendpoint :post "/" :- DataAppResponse
  "Create a data app with its resource collection and an empty bundle. It is enabled unless the request says
  otherwise."
  [_route-params
   _query-params
   body :- CreateDataAppRequest]
  (api/create-check :model/DataApp body)
  (check-editable! body)
  (let [row (merge create-defaults {:display_name (:name body)} body)
        app (data-apps.db/data-app (data-apps.apps/create-app! (with-bundle row)))]
    (events/publish-event! :event/data-app-create {:object app :user-id api/*current-user-id*})
    (data-app-response app)))

(defn- update-app!
  "Apply `changes` to the data app named `slug` and return the updated app."
  [slug changes]
  (let [app            (write-check-data-app slug)
        synced-changes (dissoc changes :enabled)]
    (when (seq synced-changes)
      (check-editable! app))
    (when (seq changes)
      (data-apps.db/update-data-app! (:id app) (with-bundle changes)))
    (let [app (data-apps.db/data-app (:id app))]
      (when (seq synced-changes)
        (events/publish-event! :event/data-app-update {:object app :user-id api/*current-user-id*}))
      (data-app-response app))))

;; NOTE on the `slug-regex` constraint: the default path-param matcher allows slashes inside a segment, so `/:slug`
;; would otherwise swallow `/x/bundle`. The regex also excludes the literal `repo-status` and `sandbox-host` routes.
(api.macros/defendpoint :put ["/:slug" :slug slug-regex] :- DataAppResponse
  "Update a data app's manifest fields, or enable or disable it. A disabled app is served to superusers only."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   changes :- UpdateDataAppRequest]
  (update-app! slug changes))

(api.macros/defendpoint :put ["/:slug/bundle" :slug slug-regex] :- DataAppResponse
  "Replace a data app's bundle."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   {:keys [bundle]} :- [:map {:closed true} [:bundle ::data-apps.schema/bundle-text]]]
  (update-app! slug {:bundle bundle}))

(api.macros/defendpoint :delete ["/:slug" :slug slug-regex] :- :nil
  "Delete a data app, its bundle, and its collection with the grants on it."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (let [app (write-check-data-app slug)]
    (check-editable! app)
    (data-apps.db/delete-data-app! (:id app))
    (events/publish-event! :event/data-app-delete {:object app :user-id api/*current-user-id*}))
  ;; a `nil` body is rendered as a 204; matches the `:- :nil` response schema
  ;; above (returning `generic-204-no-content` would fail that validation).
  nil)

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(api.macros/defendpoint :get ["/:slug/typed-schema" :slug slug-regex] :- :any
  "Return the TypeScript module of the data app's queries and actions: a `defineQuery` call for each question and metric
  and a `defineAction` call for each action in the app's collection, addressed by entity ID. Superusers only."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  {:status  200
   :headers typescript-response-headers
   :body    (data-apps.typed-schema/generate (write-check-data-app slug))})

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

(api.macros/defendpoint :get ["/:slug/group-permission-warnings" :slug slug-regex]
  :- [:sequential GroupPermissionWarning]
  "Return missing table access for the groups listed for this app."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (api/check-superuser)
  (data-app.group-access/permission-warnings (api/check-404 (data-apps.db/data-app-by-slug slug))))

(def ^:private AssignedGroup
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:member_count ms/IntGreaterThanOrEqualToZero]])

(api.macros/defendpoint :get ["/:slug/groups" :slug slug-regex] :- [:sequential AssignedGroup]
  "List the groups other than Administrators that can read a data app's resource collection."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (api/check-superuser)
  (data-app.group-access/assigned-groups (api/check-404 (data-apps.db/data-app-by-slug slug))))

(api.macros/defendpoint :post ["/:slug/groups" :slug slug-regex] :- [:sequential AssignedGroup]
  "Grant a batch of internal groups read access to a data app's resource collection atomically."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   {group-ids :group_ids} :- AddGroupsRequest]
  (api/check-superuser)
  (data-app.group-access/add-groups! (api/check-404 (data-apps.db/data-app-by-slug slug)) group-ids))

(api.macros/defendpoint :delete ["/:slug/groups/:group-id" :slug slug-regex] :- :nil
  "Revoke a group's access to a data app's resource collection."
  [{:keys [slug group-id]} :- [:map {:closed true} [:slug ms/NonBlankString] [:group-id ms/PositiveInt]]]
  (api/check-superuser)
  (data-app.group-access/remove-group! (api/check-404 (data-apps.db/data-app-by-slug slug)) group-id))

;; Not tagged `data-apps:base`, though the bundle route below is — which looks backwards until
;; you place the two callers. `DataAppView` fetches this metadata on the *host* page to decide
;; what iframe to render, before any data-app realm exists, so the request never carries the
;; marker. The bundle is fetched from inside that iframe, where it does.
(api.macros/defendpoint :get ["/:slug" :slug slug-regex] :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single data app by its slug, disabled ones to superusers only."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (let [app (api/read-check (data-apps.db/data-app-by-slug slug))]
    (data-app-response (cond-> app (not api/*is-superuser?*) check-not-outdated))))

(api.macros/defendpoint :get ["/:slug/bundle" :slug slug-regex] :- :any
  "Serve the cached JS bundle for a single data app by slug, disabled ones to superusers only. Honors
   `If-None-Match` against the content-hash ETag with a 304."
  {:scope api-scope/data-app}
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   _body
   request
   respond
   raise]
  (try
    (let [row  (check-not-outdated (api/read-check (data-apps.db/data-app-by-slug slug)))
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
                                          (json/encode (:allowed_hosts row)))
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
