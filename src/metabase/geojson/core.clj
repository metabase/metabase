(ns metabase.geojson.core
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private connection-timeout-ms 8000)

(defn- url->geojson
  [url]
  (let [resp (try (http/get url {:as                 :reader
                                 :redirect-strategy  :none
                                 :socket-timeout     connection-timeout-ms
                                 :connection-timeout connection-timeout-ms
                                 :throw-exceptions   false
                                 :dns-resolver       (u.http/network-policy-dns-resolver :external-only)})
                  (catch Throwable e
                    (if (:ssrf (ex-data e))
                      (throw (ex-info (geojson.settings/invalid-location-msg) {:status-code 400} e))
                      (throw (ex-info (tru "GeoJSON URL failed to load") {:status-code 400})))))
        ;; only 2xx is a real success — a 3xx redirect isn't followed (`:redirect-strategy :none`, for SSRF
        ;; protection), so its (empty) body must be treated as a failed load rather than streamed as GeoJSON.
        success? (<= 200 (:status resp) 299)
        allowed-content-types #{"application/geo+json"
                                "application/vnd.geo+json"
                                "application/json"
                                "text/plain"}
        ;; if the content-type header is missing, just pretend it's `text/plain` and let it through
        content-type (get-in resp [:headers :content-type] "text/plain")
        ok-content-type? (some #(str/starts-with? content-type %)
                               allowed-content-types)]
    (cond
      (not success?)
      (throw (ex-info (tru "GeoJSON URL failed to load") {:status-code 400}))

      (not ok-content-type?)
      (throw (ex-info (tru "GeoJSON URL returned invalid content-type") {:status-code 400}))

      :else (:body resp))))

(defn url->reader
  "A reader over the GeoJSON at `url`: a classpath resource when classpath GeoJSON is allowed, otherwise a remote
  fetch that refuses redirects and internal hosts."
  [url]
  (if-let [resource (and (geojson.settings/valid-geojson-resource-path? url)
                         (io/resource url))]
    (io/reader resource)
    (url->geojson url)))

(def ^:private custom-geojson-cache-ttl-ms
  "User-defined custom maps are fetched over the network, so their GeoJSON is cached — but only briefly,
  since the remote contents can change underneath us."
  (u/hours->ms 1))

(defn- fetch-geojson-data*
  [url]
  ;; url->reader handles both classpath (when MB_ALLOW_CLASSPATH_GEOJSON) and remote URLs.
  (with-open [^java.io.Reader reader (url->reader url)]
    (json/decode (slurp reader))))

(def ^:private fetch-geojson-data
  ;; Keyed by URL and only ever holds *successful* fetches: the enabled/entry-existence checks happen
  ;; outside the cache, and a fetch failure throws (so it isn't cached). This avoids caching a nil that
  ;; would otherwise keep a map broken until the TTL expires.
  (memoize/ttl fetch-geojson-data* :ttl/threshold custom-geojson-cache-ttl-ms))

(defn- custom-region-geojson
  "Resolve GeoJSON for a user-defined `custom-geojson` region key by fetching its URL (cached with a short
  TTL). Returns nil when custom GeoJSON is disabled, the key is unknown, or the fetch fails."
  [region-key]
  (when-let [{:keys [url region_key region_name]}
             (and (geojson.settings/custom-geojson-enabled)
                  (get (geojson.settings/user-defined-custom-geojson) (keyword region-key)))]
    (try
      {:data        (fetch-geojson-data url)
       :region_key  region_key
       :region_name region_name}
      (catch Throwable e
        (log/warnf "Failed to load custom GeoJSON for region %s from %s: %s"
                   (pr-str region-key) (pr-str url) (ex-message e))
        nil))))

(defn region-geojson
  "Resolve GeoJSON `{:data :region_key :region_name}` for a `custom-geojson` region key, built-in or
  user-defined. Built-in maps are read from the classpath; user maps are fetched from their URL and the
  fetched data is cached with a short TTL. Returns nil for unknown keys, disabled custom GeoJSON, or fetch
  failures. Used by static (email/Slack) rendering to embed GeoJSON without an HTTP round-trip."
  [region-key]
  (when region-key
    (or (geojson.settings/builtin-region-geojson region-key)
        (custom-region-geojson region-key))))
