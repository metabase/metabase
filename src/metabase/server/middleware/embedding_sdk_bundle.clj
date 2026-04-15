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

(def ^:private short-cache-header      "public, max-age=60")
(def ^:private far-future-cache-header "public, max-age=31536000, immutable")
(def ^:private no-store-cache-header   "no-store")

(defn- not-found []
  (-> (response/not-found "Not found")
      (assoc-in [:headers "Cache-Control"] no-store-cache-header)))

(defn- serve-for-dev
  [request resource]
  (some-> (static/static-resource request resource)
          (assoc-in [:headers "Cache-Control"] no-store-cache-header)))

(defn- serve-for-prod
  [request resource]
  (some-> (static/static-resource request resource)
          (lib.etag-cache/with-etag request {:weak? true})
          (assoc-in [:headers "Cache-Control"] short-cache-header)))

(defn- serve-chunk
  [request resource]
  (some-> (static/static-resource request resource)
          (assoc-in [:headers "Cache-Control"] far-future-cache-header)))

(defn serve-bundle-handler
  "Serve /app/embedding-sdk.js.
   When `packageVersion` query param is present and `useLegacyMonolithicBundle`
   is not `true`, serve the bootstrap entry (chunked loading with parallel auth).
   Otherwise, serve the legacy monolithic bundle (backward compat for old packages).
   Prod: ETag + 60s caching (200/304).
   Dev: no-store."
  []
  (fn [request]
    (let [{{package-version "packageVersion"
            use-legacy      "useLegacyMonolithicBundle"} :query-params} request
          use-bootstrap?  (and (some? package-version)
                               (not= "true" use-legacy))
          resource        (if use-bootstrap?
                            bootstrap-resource
                            bundle-resource)
          serve           (if config/is-prod?
                            serve-for-prod
                            serve-for-dev)]
      (or (serve request resource)
          (not-found)))))

(defn serve-chunk-handler
  "Serve /app/embedding-sdk/chunks/:filename — split chunks loaded by the bootstrap.
   Chunk filenames contain content hashes, so we always use far-future caching.
   Path traversal is prevented by the route regex `#\"[^/]+\\.js\"` which only allows
   leaf filenames ending in .js (no slashes). Additionally, Java's class loader
   resource-response returns nil for paths containing '..'"
  [filename]
  (let [resource (str "frontend_client/app/embedding-sdk/chunks/" filename)]
    (fn [request]
      (or (serve-chunk request resource)
          (not-found)))))
