(ns metabase.server.middleware.embedding-sdk-bundle
  "Embedding SDK Bundle related Ring middleware."
  (:require
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [metabase.server.routes.static :as static]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource          "frontend_client/app/embedding-sdk/legacy/embedding-sdk.js")
(def ^:private bootstrap-resource       "frontend_client/app/embedding-sdk/chunks/embedding-sdk.js")
(def ^:private content-type             "application/javascript; charset=UTF-8")
(def ^:private default-cache-header     "public, max-age=60")
(def ^:private far-future-cache-header  "public, max-age=31536000, immutable")
(def ^:private no-store-cache-header    "no-store")

(defn- not-found []
  (-> (response/not-found "Not found")
      (update :headers merge no-store-cache-header)))

(defn- serve-for-dev [response _request]
  (cond-> response
    (assoc-in [:headers "Cache-Control"] no-store-cache-header)))

(defn- serve-for-prod [response request]
  (some-> response
          (lib.etag-cache/with-etag request)
          (assoc-in [:headers "Cache-Control"] default-cache-header)))

(defn- serve-resource-handler
  "Serve a JS resource with ETag + 60s caching in prod, no-store in dev."
  [resource]
  (fn [request]
    (let [response (static/static-resource request resource)
          serve    (if config/is-prod? serve-for-prod serve-for-dev)]
      (or (some-> (static/static-resource request resource)
                  (serve request))
          (not-found)))))

(defn serve-bundle-handler
  "Serve /app/embedding-sdk.js.
   When `packageVersion` query param is present and `useLegacyMonolithicBundle`
   is not `true`, serve the bootstrap entry (chunked loading with parallel auth).
   Otherwise, serve the legacy monolithic bundle (backward compat for old packages).
   Prod: ETag + 60s caching (200/304). Dev: no-store."
  []
  (fn [request]
    (let [package-version (get-in request [:query-params "packageVersion"])
          use-legacy      (get-in request [:query-params "useLegacyMonolithicBundle"])
          use-bootstrap?  (and (some? package-version)
                               (not= "true" use-legacy))
          resource        (if use-bootstrap?
                            bootstrap-resource
                            bundle-resource)]
      ((serve-resource-handler resource) request))))

(defn serve-chunk-handler
  "Serve /app/embedding-sdk/chunks/:filename — split chunks loaded by the bootstrap.
   Chunk filenames contain content hashes, so we always use far-future caching.
   Path traversal is prevented by the route regex `#\"[^/]+\\.js\"` which only allows
   leaf filenames ending in .js (no slashes). Additionally, Java's class loader
   resource-response returns nil for paths containing '..'"
  [filename]
  (let [resource (str "frontend_client/app/embedding-sdk/chunks/" filename)]
    (fn [_request]
      (let [base (static/static-resource request resource)]
        (if (nil? base)
          (not-found)
          (-> base
              (update :headers merge far-future-cache-header vary-accept-encoding-header)
              (response/content-type content-type)))))))
