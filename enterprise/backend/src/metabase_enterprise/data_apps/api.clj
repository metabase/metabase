(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/apps`. Serves the bundles materialized by
   [[metabase-enterprise.data-apps.sync]]; see `README.md` in this directory for
   where apps come from and how the pieces fit together.

   Note: we can't use `/app/...` for the frontend or `/api/app/...` for the API
   because Metabase's server reserves `/app/*` for serving static assets (see
   `metabase.server.routes/static-files-handler`)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Constants ------------------------------------------------

;; Slug must not collide with the literal `repo-status` sub-route.
(def ^:private slug-regex #"(?!repo-status$)[^/]+")

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
  "Return full data-app metadata to superusers and only navigational fields to other users."
  [app]
  (if api/*is-superuser?*
    app
    (select-keys app [:name :display_name])))

(api.macros/defendpoint :get "/" :- [:sequential [:or DataAppResponse PublicDataAppResponse]]
  "List the data apps provided by the connected repository. Pass `available=true`
   to return only enabled apps without sync errors."
  [_route-params
   {:keys [available]} :- [:map [:available {:optional true} [:maybe :boolean]]]]
  (->> (data-app/select-non-blob (cond-> {:order-by [[:display_name :asc]]}
                                   available (assoc :where [:and
                                                            [:= :enabled true]
                                                            [:= :sync_error nil]])))
       (map api/read-check)
       (mapv data-app-response)))

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

(api.macros/defendpoint :get ["/:slug" :slug slug-regex] :- [:or DataAppResponse PublicDataAppResponse]
  "Fetch metadata for a single enabled data app by its slug."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (data-app-response (api/read-check (data-app/select-one-non-blob :name slug :enabled true))))

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
    (let [row  (api/read-check (data-app/select-one-non-blob :name slug :enabled true))
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
