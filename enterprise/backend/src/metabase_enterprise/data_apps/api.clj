(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/apps`: create, read, update, and delete data apps, and serve their
   bundles. See `README.md` in this directory for how the pieces fit together.

   Note: we can't use `/app/...` for the frontend or `/api/app/...` for the API
   because Metabase's server reserves `/app/*` for serving static assets (see
   `metabase.server.routes/static-files-handler`)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate :as data-apps.generate]
   [metabase-enterprise.data-apps.group-access :as data-app.group-access]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)
   (java.net URI)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Constants ------------------------------------------------

;; Slug must not collide with the literal `repo-status`/`sandbox-host`/`generate` sub-routes.
(def ^:private slug-regex #"(?!repo-status$|sandbox-host$|generate$)[^/]+")

(def ^:private bundle-response-headers
  ;; `no-cache` so the browser may cache but must revalidate via
  ;; the content-hash ETag — we answer If-None-Match with 304 below.
  {"Content-Type"                 "application/javascript"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-cache"})

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- metaplow-origin
  "Origin of the configured Metaplow collector, without its `/api/send` path.
   The data-app sandbox accepts origins, not URLs with paths."
  []
  (when-let [url (setting/get-value-of-type :string :metaplow-url)]
    (try
      (let [uri    (URI. url)
            scheme (some-> (.getScheme uri) u/lower-case-en)
            host   (.getHost uri)
            port   (.getPort uri)]
        (when (and (#{"http" "https"} scheme) host)
          (str scheme "://" host (when-not (= -1 port) (str ":" port)))))
      (catch Exception _))))

(defn- bundle-allowed-hosts
  "Origins the bundle may fetch, including the configured analytics collector."
  [allowed-hosts]
  (let [origin (metaplow-origin)]
    (cond-> allowed-hosts
      origin (conj origin))))

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
   [:table_ids       [:sequential ms/PositiveInt]]
   [:bundle_hash     [:maybe :string]]
   [:created_at      :any]
   [:updated_at      :any]])

(def ^:private CreateDataAppRequest
  [:map {:closed true}
   [:name          ::data-apps.schema/slug]
   [:display_name  ::data-apps.schema/display-name]
   [:description   {:optional true} ::data-apps.schema/description]
   [:version       {:optional true} ::data-apps.schema/version]
   [:bundle_path   ::data-apps.schema/bundle-path]
   [:allowed_hosts {:optional true} ::data-apps.schema/allowed-hosts]
   [:bundle        ::data-apps.schema/bundle-text]])

(def ^:private UpdateDataAppRequest
  [:map {:closed true}
   [:enabled       {:optional true} :boolean]
   [:display_name  {:optional true} ::data-apps.schema/display-name]
   [:description   {:optional true} ::data-apps.schema/description]
   [:version       {:optional true} ::data-apps.schema/version]
   [:bundle_path   {:optional true} ::data-apps.schema/bundle-path]
   [:allowed_hosts {:optional true} ::data-apps.schema/allowed-hosts]
   [:bundle        {:optional true} ::data-apps.schema/bundle-text]])

(def ^:private PublicDataAppResponse
  [:map {:closed true}
   [:name         ms/NonBlankString]
   [:display_name ms/NonBlankString]])

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
  (if api/*is-superuser?*
    (assoc app :outdated (data-app.config/outdated? app))
    (select-keys app [:name :display_name])))

(defn- read-check-data-app
  "Check whether the current user can access a data app. Viewing requires read access to the app's
   resource collection, which every app has."
  [app]
  (api/read-check app)
  (api/read-check :model/Collection (:resource_collection_id app))
  app)

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
  "List the data apps. Pass `available=true` to return only enabled apps. An outdated app is never
   available, and otherwise listed only to superusers, who see it badged."
  [_route-params
   {:keys [available]} :- [:map {:closed true} [:available {:optional true} [:maybe :boolean]]]]
  (->> (data-apps.db/data-apps available)
       (filter mi/can-read?)
       (remove #(and (or available (not api/*is-superuser?*))
                     (data-app.config/outdated? %)))
       (mapv data-app-response)))

;; NOTE on the `slug-regex` constraint: the default path-param matcher allows
;; slashes inside a segment, so `/:slug` would otherwise swallow `/x/bundle`.
;; The regex also excludes the literal `repo-status` sub-route above.
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
  "Create a data app from its manifest fields and bundle."
  [_route-params
   _query-params
   body :- CreateDataAppRequest]
  (api/create-check :model/DataApp body)
  (check-editable! body)
  (let [app (data-apps.db/data-app (data-apps.apps/create-app! (with-bundle body)))]
    (events/publish-event! :event/data-app-create {:object app :user-id api/*current-user-id*})
    (data-app-response app)))

;; NOTE on the `slug-regex` constraint: the default path-param matcher allows
;; slashes inside a segment, so `/:slug` would otherwise swallow `/x/bundle`.
;; The regex also excludes the literal `repo-status` sub-route above.
(api.macros/defendpoint :put ["/:slug" :slug slug-regex] :- DataAppResponse
  "Update a data app's manifest fields or bundle, or enable or disable it. Disabled apps are not served."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   changes :- UpdateDataAppRequest]
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

(api.macros/defendpoint :delete ["/:slug" :slug slug-regex] :- :nil
  "Delete a data app, its bundle, its collection, and its group assignments."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (let [app (write-check-data-app slug)]
    (check-editable! app)
    (data-apps.db/delete-data-app! (:id app))
    (events/publish-event! :event/data-app-delete {:object app :user-id api/*current-user-id*}))
  ;; a `nil` body is rendered as a 204; matches the `:- :nil` response schema
  ;; above (returning `generic-204-no-content` would fail that validation).
  nil)

(api.macros/defendpoint :post "/generate/app" :- ::data-apps.schema/app-files
  "A new data app's `data_app.yaml` and its collection's file, each at its path from the repository root and with the
  YAML a remote-sync export writes, with new entity IDs. For superusers: the files are written into the app's
  repository, which only an admin works with."
  [_route-params
   _query-params
   body :- ::data-apps.schema/app-request]
  (api/check-superuser)
  (data-apps.generate/app body))

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(api.macros/defendpoint :get "/generate/schemas" :- :any
  "The TypeScript module a data app's definitions are written against: the root libraries' tables and metrics, and
  the query actions that belong to no model. For superusers: a data app's author builds from it, and only an admin
  works with an app's repository."
  []
  (api/check-superuser)
  {:status  200
   :headers typescript-response-headers
   :body    (data-apps.generate/schemas)})

(api.macros/defendpoint :post "/generate/resources" :- [:map {:closed true}
                                                        [:queries [:sequential ::data-apps.schema/file]]
                                                        [:actions [:sequential ::data-apps.schema/file]]
                                                        [:metrics [:sequential ::data-apps.schema/file]]]
  "The files of a data app's collection, each a file name in the collection's folder and the YAML a remote-sync
  export writes: the saved question of each `defineQuery` definition in `queries`, the copy of each action without a
  model in `actions`, and the copies of the metrics the queries aggregate. Each item answers on its own, with its file
  or the error that stops it. For superusers: the files are written into the app's repository, which only an admin
  works with."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:queries {:optional true} [:maybe [:sequential ::data-apps.schema/query]]]
            [:actions {:optional true} [:maybe [:sequential ::data-apps.schema/action]]]]]
  (api/check-superuser)
  (data-apps.generate/resources body))

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
  "Return missing table access for groups already assigned to this app."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (api/check-superuser)
  (data-app.group-access/permission-warnings (api/check-404 (data-apps.db/data-app-by-slug slug))))

(def ^:private AssignedGroup
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:member_count ms/IntGreaterThanOrEqualToZero]])

(api.macros/defendpoint :get ["/:slug/groups" :slug slug-regex] :- [:sequential AssignedGroup]
  "List the groups assigned to a data app."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (api/check-superuser)
  (data-app.group-access/assigned-groups (api/check-404 (data-apps.db/data-app-by-slug slug))))

(api.macros/defendpoint :post ["/:slug/groups" :slug slug-regex] :- [:sequential AssignedGroup]
  "Assign a batch of internal groups atomically."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   {group-ids :group_ids} :- AddGroupsRequest]
  (api/check-superuser)
  (data-app.group-access/add-groups! (api/check-404 (data-apps.db/data-app-by-slug slug)) group-ids))

(api.macros/defendpoint :delete ["/:slug/groups/:group-id" :slug slug-regex] :- :nil
  "Remove a group's assignment and collection access."
  [{:keys [slug group-id]} :- [:map {:closed true} [:slug ms/NonBlankString] [:group-id ms/PositiveInt]]]
  (api/check-superuser)
  (data-app.group-access/remove-group! (api/check-404 (data-apps.db/data-app-by-slug slug)) group-id))

;; Not tagged `data-apps:base`, though the bundle route below is — which looks backwards until
;; you place the two callers. `DataAppView` fetches this metadata on the *host* page to decide
;; what iframe to render, before any data-app realm exists, so the request never carries the
;; marker. The bundle is fetched from inside that iframe, where it does.
(api.macros/defendpoint :get ["/:slug" :slug slug-regex] :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single enabled data app by its slug."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]]
  (let [app (read-check-data-app (data-apps.db/enabled-data-app-by-slug slug))]
    (data-app-response (cond-> app (not api/*is-superuser?*) check-not-outdated))))

(api.macros/defendpoint :get ["/:slug/bundle" :slug slug-regex] :- :any
  "Serve the cached JS bundle for a single enabled data app by slug. Honors
   `If-None-Match` against the content-hash ETag with a 304."
  {:scope api-scope/data-app}
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   _body
   request
   respond
   raise]
  (try
    (let [row  (check-not-outdated (read-check-data-app (data-apps.db/enabled-data-app-by-slug slug)))
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
                                   ;; JSON array of origins the sandboxed bundle may fetch/XHR. Include
                                   ;; the configured product analytics collector so SDK analytics work
                                   ;; without granting access to the collector for another environment.
                                   ;; The iframe reads this to configure its Near-Membrane fetch allowlist.
                                   (assoc "X-Metabase-Data-App-Allowed-Hosts"
                                          (json/encode (bundle-allowed-hosts (:allowed_hosts row))))
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
