(ns metabase.geojson.api
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
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
        success? (<= 200 (:status resp) 399)
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
  (if-let [resource (io/resource url)]
    (io/reader resource)
    (url->geojson url)))

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
  (when-not (or (geojson.settings/custom-geojson-enabled) ((geojson.settings/builtin-geojson) (keyword k)))
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (if-let [url (get-in (geojson.settings/custom-geojson) [(keyword k) :url])]
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
