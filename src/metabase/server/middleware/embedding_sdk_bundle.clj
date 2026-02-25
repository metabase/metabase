(ns metabase.server.middleware.embedding-sdk-bundle
  "Embedding SDK Bundle related Ring middleware."
  (:require
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource    "frontend_client/app/embedding-sdk/legacy/embedding-sdk.js")
(def ^:private bootstrap-resource "frontend_client/app/embedding-sdk/chunks/embedding-sdk.js")
(def ^:private content-type    "application/javascript; charset=UTF-8")
(def ^:private default-cache-header      {"Cache-Control" "public, max-age=60"})
(def ^:private far-future-cache-header   {"Cache-Control" "public, max-age=31536000, immutable"})
(def ^:private no-store-cache-header     {"Cache-Control" "no-store"})
(def ^:private vary-accept-encoding-header {"Vary" "Accept-Encoding"})

(defn- not-found []
  (-> (response/not-found "Not found")
      (update :headers merge no-store-cache-header)))

(defn- serve-for-dev [base]
  (-> base
      (response/content-type content-type)
      (update :headers merge no-store-cache-header)))

(defn- serve-for-prod [base request]
  (let [resp (lib.etag-cache/with-etag base request)]
    (cond-> resp
      true                    (update :headers merge
                                      default-cache-header
                                      vary-accept-encoding-header)
      (= 200 (:status resp)) (response/content-type content-type))))

(defn- serve-resource-handler
  "Serve a JS resource with ETag + 60s caching in prod, no-store in dev."
  [resource]
  (fn [request]
    (let [base (response/resource-response resource)]
      (cond
        (nil? base)       (not-found)
        config/is-prod?   (serve-for-prod base request)
        :else             (serve-for-dev base)))))

(defn serve-bundle-handler
  "Serve /app/embedding-sdk.js.
   When `packageVersion` query param is present, serve the bootstrap (chunked loading).
   Otherwise, serve the legacy monolithic bundle.
   Prod: ETag + 60s caching (200/304). Dev: no-store."
  []
  (fn [request]
    (let [package-version (get-in request [:query-params "packageVersion"])
          resource        (if (some? package-version)
                            bootstrap-resource
                            bundle-resource)]
      ((serve-resource-handler resource) request))))

(defn serve-chunk-handler
  "Serve /app/embedding-sdk-chunks/:filename — split chunks loaded by the bootstrap.
   Chunk filenames contain content hashes, so we always use far-future caching."
  [filename]
  (let [resource (str "frontend_client/app/embedding-sdk/chunks/" filename)]
    (fn [_request]
      (let [base (response/resource-response resource)]
        (if (nil? base)
          (not-found)
          (-> base
              (update :headers merge far-future-cache-header vary-accept-encoding-header)
              (response/content-type content-type)))))))
