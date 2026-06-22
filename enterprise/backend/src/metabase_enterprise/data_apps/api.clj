(ns metabase-enterprise.data-apps.api
  "Data-app endpoints, mounted at `/api/data-app`.

   Data apps come from the repository connected via the remote-sync feature. The
   repo's `data_apps/<dir>/data_app.yml` files are discovered on sync and each is
   materialized as one `data_app` row, caching the app's bundle. Users navigate to
   `/data-app/:slug`, which fetches `/api/data-app/:slug/bundle` and evaluates the
   bytes inside a Near Membrane sandbox.

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
  {:configured (data-app.sync/repo-configured?)})

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

(def ^:private RepoStatusResponse
  [:map
   [:configured :boolean]])

;;; --------------------------------------------- Repo status ---------------------------------------------

(api.macros/defendpoint :get "/repo-status" :- RepoStatusResponse
  "Status of the connected repository as it relates to data apps. Data apps are
   pulled by the remote-sync import (manual \"Pull changes\", auto-import, or
   startup); the connection is configured on the remote-sync settings page."
  []
  (api/check-superuser)
  (repo-status))

;;; ------------------------------------------------ Apps ------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential DataAppResponse]
  "List the data apps provided by the connected repository."
  []
  (api/check-superuser)
  (->> (data-app/select-non-blob {:order-by [[:display_name :asc]]})
       (mapv api/read-check)))

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

(api.macros/defendpoint :get ["/:slug" :slug slug-regex] :- DataAppResponse
  "Fetch metadata for a single enabled data app by its slug."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (api/read-check (data-app/select-one-non-blob :name slug :enabled true)))

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
    (api/check-superuser)
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
  "`/api/data-app` routes."
  (api.macros/ns-handler *ns* +auth))
