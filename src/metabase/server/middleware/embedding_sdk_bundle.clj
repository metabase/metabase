(ns metabase.server.middleware.embedding-sdk-bundle
  "Embedding SDK Bundle related Ring middleware."
  (:require
   [metabase.config.core :as config]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource "frontend_client/app/embedding-sdk.js")
(def ^:private content-type    "application/javascript; charset=UTF-8")
(def ^:private default-cache-header {"Cache-Control" "public, max-age=60"})
(def ^:private no-store-cache-header   {"Cache-Control" "no-store"})
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
      true                 (update :headers merge
                                   default-cache-header
                                   vary-accept-encoding-header)
      (= 200 (:status resp)) (response/content-type content-type))))

(defn serve-bundle-handler
  "Serve /app/embedding-sdk.js. Prod: ETag + 60s caching (200/304). Dev: no-store."
  []
  (fn [request]
    (let [base (response/resource-response bundle-resource)]
      (cond
        (nil? base)                         (not-found)
        config/is-prod?                     (serve-for-prod base request)
        :else                               (serve-for-dev base)))))
