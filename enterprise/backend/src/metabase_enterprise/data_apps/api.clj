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
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)))

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

;; NOTE on the `slug-regex` constraint: the default path-param matcher allows slashes inside a segment, so `/:slug`
;; would otherwise swallow `/x/bundle`. The regex also excludes the literal `repo-status`, `sandbox-host` and
;; `generate` routes.
(api.macros/defendpoint :put ["/:slug" :slug slug-regex] :- DataAppResponse
  "Enable or disable a data app. A disabled app is served to superusers only. Superusers only; anything else about an
  app changes only through a repository import."
  [{:keys [slug]} :- [:map {:closed true} [:slug ms/NonBlankString]]
   _query-params
   {:keys [enabled]} :- UpdateDataAppRequest]
  (api/check-superuser)
  (let [app (api/check-404 (data-apps.db/data-app-by-slug slug))]
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
