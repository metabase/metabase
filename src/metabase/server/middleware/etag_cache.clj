(ns metabase.server.middleware.etag-cache
  "ETag caching-related Ring middleware."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def etag-header
  "Headers that tell browsers to cache a static resource and revalidate using the etag with the Metabase version hash."
  {"Cache-Control" "public, max-age=0, must-revalidate"
   ;; according to the spec, the ETag should be a quoted string
   "ETag" (format "\"%s\"" config/mb-version-hash)})

(defn- matches-metabase-version-hash?
  "Returns true if the If-None-Match header (possibly weak/quoted) equals the current version hash."
  [if-none-match-value]
  (when if-none-match-value
    (let [normalized
          (-> if-none-match-value
              ;; strip any leading "W/" (weak ETag) prefix
              (str/replace-first #"^W/" "")
              ;; strip any leading or trailing quotes
              (str/replace #"^\"|\"$" ""))]
      (= normalized config/mb-version-hash))))

(def ^:private not-modified-response
  "Returns a 304 Not Modified response with ETag and Cache-Control headers for the current Metabase version hash."
  (-> (response/response "")
      (response/status 304)
      (update :headers merge etag-header)))

(defn- js-response-with-etag
  "Given a Ring response map (typically from `resource-response`), set
   the correct Content-Type and Metabase-version-based cache headers
   for embedding-sdk.js."
  [response]
  (-> response
      (response/content-type "application/javascript; charset=UTF-8")
      (update :headers merge etag-header)))

(defn js-etag-handler
  "Returns a Ring handler that serves a JS file with ETag/Cache-Control headers.
   If the If-None-Match header matches the current version hash and not in dev mode,
   returns a 304 Not Modified response instead."
  [resource-path]
  (fn [request]
    (let [if-none-match (get-in request [:headers "if-none-match"])]
      (if (and (not config/is-dev?)
               (matches-metabase-version-hash? if-none-match))

        ;; send the pre-built 304 response
        not-modified-response

        ;; else, serve the file
        (js-response-with-etag
         (response/resource-response resource-path))))))
