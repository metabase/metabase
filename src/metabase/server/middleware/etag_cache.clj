(ns metabase.server.middleware.etag-cache
  "ETag caching-related Ring middleware."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def etag-headers-for-metabase-version-hash
  "Headers that tell browsers to cache a static resource and revalidate using the etag with the Metabase version hash."
  {"Cache-Control" "public, max-age=0, must-revalidate"
   ;; according to the spec, the ETag should be a quoted string
   "ETag" (str "\"" config/mb-version-hash "\"")})

(defn matches-metabase-version-hash?
  "Returns true if the If-None-Match header (possibly weak/quoted) equals the current version hash."
  [if-none-match]
  (when if-none-match
    (let [normalized
          (-> if-none-match
              ;; strip any leading "W/" (weak ETag) prefix
              (str/replace-first #"^W/" "")
              ;; strip any leading or trailing quotes
              (str/replace #"^\"|\"$" ""))]
      (= normalized config/mb-version-hash))))

(def not-modified-response
  "Returns a 304 Not Modified response with ETag and Cache-Control headers for the current Metabase version hash."
  (-> (response/response "")
      (response/status 304)
      (update :headers merge etag-headers-for-metabase-version-hash)))

(defn js-response-with-etag
  "Given a Ring response map (typically from `resource-response`), set
   the correct Content-Type and Metabase-version-based cache headers
   for embedding-sdk.js."
  [resp]
  (-> resp
      (response/content-type "application/javascript; charset=UTF-8")
      (update :headers merge etag-headers-for-metabase-version-hash)))
