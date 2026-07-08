(ns metabase.geojson.api
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [ring.util.response :as response])
  (:import
   (java.io BufferedReader)
   (java.net InetAddress)
   (org.apache.commons.io.input ReaderInputStream)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn SystemDefaultDnsResolver)))

(set! *warn-on-reflection* true)

(def ^:private connection-timeout-ms 8000)

(def ^DnsResolver ^:private ^:dynamic  *system-dns-resolver* (SystemDefaultDnsResolver.))

(def ^:private non-link-local-dns-resolver
  (reify
    DnsResolver
    (^"[Ljava.net.InetAddress;" resolve [_ ^String host]
      (let [addresses (.resolve *system-dns-resolver* host)]
        (if (some #(.isLinkLocalAddress ^InetAddress %) addresses)
          (throw (ex-info (geojson.settings/invalid-location-msg) {:status-code 400
                                                                   :link-local true}))
          addresses)))))

(defn- url->geojson
  [url]
  (let [resp (try (http/get url {:as                 :reader
                                 :redirect-strategy  :none
                                 :socket-timeout     connection-timeout-ms
                                 :connection-timeout connection-timeout-ms
                                 :throw-exceptions   false
                                 :dns-resolver       non-link-local-dns-resolver})
                  (catch Throwable e
                    (if (:link-local (ex-data e))
                      (throw (ex-info (ex-message e) (dissoc (ex-data e) :link-local) e))
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

(defn- url->reader [url]
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
        (log/warnf e "Failed to load custom GeoJSON for region %s from %s"
                   (pr-str region-key) (pr-str url))
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

(defn- read-url-and-respond
  "Reads the provided URL and responds with the contents as a stream."
  [url respond]
  (with-open [^BufferedReader reader (url->reader url)
              is                     (ReaderInputStream. reader)]
    (respond (-> (response/response is)
                 (response/content-type "application/json")))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:key"
  "Fetch a custom GeoJSON file as defined in the [[metabase.geojson.settings/custom-geojson]] setting. (This just acts
  as a simple proxy for the file specified for `key`)."
  [{k :key, :as _route-params} :- [:map
                                   [:key ms/NonBlankString]]
   _query-params
   _body
   _request
   respond
   raise]
  (when-not (geojson.settings/custom-geojson-enabled)
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (if-let [url (get-in (geojson.settings/user-defined-custom-geojson) [(keyword k) :url])]
    (try
      (read-url-and-respond url respond)
      (catch Throwable e
        (raise e)))
    (raise (ex-info (tru "Invalid custom GeoJSON key: {0}" k) {:status-code 400}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Load a custom GeoJSON file based on a URL or file path provided as a query parameter.
  This behaves similarly to /api/geojson/:key but doesn't require the custom map to be saved to the DB first."
  [_route-params
   {:keys [url], :as _query-params} :- [:map
                                        [:url ms/NonBlankString]]
   _body
   _request
   respond
   raise]
  (perms/check-has-application-permission :setting)
  (when-not (geojson.settings/custom-geojson-enabled)
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (let [decoded-url (codec/url-decode url)]
    (try
      (when-not (geojson.settings/valid-geojson-url? decoded-url)
        (throw (ex-info (geojson.settings/invalid-location-msg) {:status-code 400})))
      (read-url-and-respond decoded-url respond)
      (catch Throwable e
        (raise e)))))
