(ns metabase-enterprise.data-app-demo.api
  "Data-app PoC endpoints, mounted at `/api/ee/data-app`.

   Each uploaded data-app is a single `index.js` file (no manifest, no
   assets, no archive) stored as a row in the `data_app` table. Users
   navigate to `/data-app/:slug` in the frontend, which fetches
   `/api/ee/data-app/:slug/bundle` and evaluates the bytes inside a Near
   Membrane sandbox.

   Note: we can't use `/app/...` for the frontend or `/api/ee/app/...` for
   the API because Metabase's server reserves `/app/*` for serving static
   assets (see `metabase.server.routes/static-files-handler`)."
  (:require
   [metabase-enterprise.data-app-demo.models.data-app :as data-app]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream File)
   (java.nio.file Files)
   (java.security MessageDigest)
   (org.apache.commons.codec.binary Hex)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Constants ------------------------------------------------

(def ^:const ^:private max-bundle-bytes
  "Cap on uploaded index.js size. 5 MiB matches the custom-viz cap."
  (* 5 1024 1024))

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- bytes-hash ^String [^bytes b]
  (let [^MessageDigest md (MessageDigest/getInstance "SHA-256")]
    (Hex/encodeHexString ^bytes (.digest md b))))

(defn- check-upload!
  "Validate an incoming multipart `file` part. Returns the tempfile."
  ^File [file]
  (let [tempfile (:tempfile file)]
    (when-not (instance? File tempfile)
      (throw (ex-info "No file provided" {:status-code 400})))
    (when (> (long (:size file)) max-bundle-bytes)
      (throw (ex-info (format "Bundle must be less than %d MiB." (quot max-bundle-bytes (* 1024 1024)))
                      {:status-code 413})))
    tempfile))

(def ^:private bundle-response-headers
  {"Content-Type"                 "application/javascript"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

;;; ------------------------------------------------ Schemas ------------------------------------------------

(def ^:private DataAppResponse
  [:map
   [:id           ms/PositiveInt]
   [:name         ms/NonBlankString]
   [:display_name ms/NonBlankString]
   [:bundle_hash  ms/NonBlankString]
   [:creator_id   {:optional true} [:maybe ms/PositiveInt]]
   [:created_at   :any]
   [:updated_at   :any]])

;;; ------------------------------------------------ Endpoints ------------------------------------------------

(api.macros/defendpoint :post "/" :- DataAppResponse
  "Upload a new data-app bundle. PoC scope: accepts a single `index.js` as
   the `file` multipart field plus `name` and `display_name` form fields."
  ;; `:max-file-count` counts every multipart part (form fields included),
  ;; not just files — we have three (file + name + display_name) so we cap
  ;; only by per-file size.
  {:multipart {:max-file-size max-bundle-bytes}}
  [_route-params
   _query-params
   _body
   {{file "file" app-name "name" display-name "display_name"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["name"         ms/NonBlankString]
         ["display_name" ms/NonBlankString]
         ["file" [:map
                  [:filename :string]
                  [:tempfile (ms/InstanceOfClass File)]]]]]]]
  (api/check-superuser)
  (let [tempfile (check-upload! file)]
    (try
      (api/check-400 (not (t2/exists? :model/DataApp :name app-name))
                     (format "A data app named \"%s\" already exists." app-name))
      (let [bundle-bytes (Files/readAllBytes (.toPath tempfile))
            hash         (bytes-hash bundle-bytes)
            app          (first (t2/insert-returning-instances!
                                 :model/DataApp
                                 :name         app-name
                                 :display_name display-name
                                 :bundle       bundle-bytes
                                 :bundle_hash  hash
                                 :creator_id   api/*current-user-id*))]
        (log/warnf "[data-app] uploaded name=%s id=%s bundle-bytes=%d hash=%s"
                   app-name (:id app) (alength bundle-bytes) hash)
        (data-app/select-one-non-blob :id (:id app)))
      (finally
        (try (.delete tempfile) (catch Exception _))))))

(api.macros/defendpoint :get "/" :- [:sequential DataAppResponse]
  "List all uploaded data apps."
  []
  (api/check-superuser)
  (->> (data-app/select-non-blob {:order-by [[:display_name :asc]]})
       (mapv api/read-check)))

;; NOTE on the `:slug #"[^/]+"` regex constraints below.
;;
;; The default path-param matcher used by Metabase's defendpoint allows slashes
;; inside path segments, so a request like `GET /test/bundle` matches
;; `:get "/:slug"` with `slug="test/bundle"` and never reaches the
;; `:get "/:slug/bundle"` handler. Constraining `:slug` to `[^/]+` makes
;; the matcher refuse multi-segment paths and routes `/test/bundle` to the
;; bundle handler.
(api.macros/defendpoint :get ["/:slug" :slug #"[^/]+"] :- DataAppResponse
  "Fetch metadata for a single data app by its name (slug)."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (api/read-check (data-app/select-one-non-blob :name slug)))

(api.macros/defendpoint :put ["/:slug" :slug #"[^/]+"] :- DataAppResponse
  "Update an existing data app. Multipart body may include `file` (replaces the
   bundle) and/or `display_name`. The `name` (URL slug) is the identity and
   cannot be renamed via this endpoint."
  {:multipart {:max-file-size max-bundle-bytes}}
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   _body
   {{file "file" display-name "display_name"} :multipart-params, :as _request}
   :- [:map
       [:multipart-params
        [:map
         ["display_name" {:optional true} ms/NonBlankString]
         ["file" {:optional true}
          [:map
           [:filename :string]
           [:tempfile (ms/InstanceOfClass File)]]]]]]]
  (api/check-superuser)
  (let [existing (api/write-check (data-app/select-one-non-blob :name slug))
        bundle-fields (when file
                        (let [tempfile (check-upload! file)]
                          (try
                            (let [bundle-bytes (Files/readAllBytes (.toPath tempfile))]
                              {:bundle      bundle-bytes
                               :bundle_hash (bytes-hash bundle-bytes)})
                            (finally
                              (try (.delete tempfile) (catch Exception _))))))
        update-map (cond-> {}
                     display-name  (assoc :display_name display-name)
                     bundle-fields (merge bundle-fields))]
    (api/check-400 (seq update-map) "Nothing to update.")
    (t2/update! :model/DataApp (:id existing) update-map)
    (log/warnf "[data-app] updated name=%s id=%s fields=%s"
               slug (:id existing) (vec (keys update-map)))
    (data-app/select-one-non-blob :id (:id existing))))

(api.macros/defendpoint :delete ["/:slug" :slug #"[^/]+"] :- :nil
  "Delete a data app and its bundle by name (slug)."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]]
  (api/write-check (data-app/select-one-non-blob :name slug))
  (t2/delete! :model/DataApp :name slug)
  nil)

(api.macros/defendpoint :get ["/:slug/bundle" :slug #"[^/]+"] :- :any
  "Serve the JS bundle for a single data app by name (slug)."
  [{:keys [slug]} :- [:map [:slug ms/NonBlankString]]
   _query-params
   _body
   _request
   respond
   raise]
  (try
    (api/check-superuser)
    (let [row (api/read-check (data-app/select-one-non-blob :name slug))
          ^bytes bundle (t2/select-one-fn :bundle :model/DataApp :id (:id row))]
      (if (and bundle (pos? (alength bundle)))
        (respond {:status  200
                  :headers (assoc bundle-response-headers "ETag" (:bundle_hash row))
                  :body    (ByteArrayInputStream. bundle)})
        (respond {:status 404 :headers {"Content-Type" "application/json"} :body "{\"error\":\"Bundle missing\"}"})))
    (catch Throwable e
      (raise e))))

(def routes
  "`/api/ee/data-app` routes."
  (api.macros/ns-handler *ns* +auth))
