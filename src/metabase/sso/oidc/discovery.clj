(ns metabase.sso.oidc.discovery
  "OIDC discovery document fetching and caching.

   Fetches and caches OpenID Connect discovery documents from provider issuers.
   Falls back to manual configuration when discovery is unavailable."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.sso.settings :as sso.settings]
   [metabase.util.http :as u.http]
   [metabase.util.log :as log]))

(def ^:private discovery-cache
  "Cache of discovery documents with TTL.
   Map of issuer URL string -> {:document discovery-map :fetched-at timestamp}."
  (atom {}))

(def ^:private discovery-cache-ttl-ms
  "Discovery document cache TTL: 24 hours. After this time, cached documents will be re-fetched.
   This ensures endpoint changes by IdPs are picked up within a reasonable timeframe."
  86400000)

(defn- cache-expired?
  "Check if a cache entry has expired based on its fetched-at timestamp."
  [cache-entry]
  (or (nil? cache-entry)
      (nil? (:fetched-at cache-entry))
      (> (- (t/to-millis-from-epoch (t/instant)) (:fetched-at cache-entry))
         discovery-cache-ttl-ms)))

(defn- normalize-issuer
  "Normalize issuer URL by removing trailing slashes."
  [issuer]
  (when issuer
    (str/replace issuer #"/$" "")))

(defn- discovery-url
  "Build the OIDC discovery document URL for the given issuer."
  [issuer]
  (str (normalize-issuer issuer) "/.well-known/openid-configuration"))

(defn- fetch-discovery-document
  "Fetch the OIDC discovery document from the issuer.
   Returns the parsed JSON document or nil on error."
  [issuer]
  (let [url (discovery-url issuer)]
    (when-not (u.http/valid-host? (sso.settings/oidc-allowed-networks) url)
      (throw (ex-info "Invalid issuer URL: address not allowed by network restrictions"
                      {:url url})))
    (try
      (log/infof "Fetching OIDC discovery document from %s" url)
      (let [response (http/get url {:as :json
                                    :accept :json
                                    :throw-exceptions false
                                    :conn-timeout 5000
                                    :socket-timeout 5000})]
        (if (= 200 (:status response))
          (:body response)
          (do
            (log/warnf "OIDC discovery failed with status %s: %s" (:status response) (:body response))
            nil)))
      (catch Exception e
        (log/warnf e "Failed to fetch OIDC discovery document from %s" url)
        nil))))

(defn clear-cache!
  "Clear all cached discovery documents.
   Useful for testing or when configuration changes."
  []
  (reset! discovery-cache {}))

(defn invalidate-cache!
  "Invalidate cached discovery document for a specific issuer.
   Useful when an admin wants to force a refresh."
  [issuer]
  (when issuer
    (let [normalized (normalize-issuer issuer)]
      (swap! discovery-cache dissoc normalized)
      (log/infof "Invalidated discovery cache for issuer %s" normalized)))
  nil)

(defn discover-oidc-configuration
  "Fetch and cache the OIDC discovery document for the given issuer.

   Parameters:
   - issuer: The issuer URL (e.g., \"https://accounts.google.com\")

   Returns the discovery document map or nil if discovery fails.
   Results are cached per issuer with TTL-based expiration (see [[discovery-cache-ttl-ms]])."
  [issuer]
  (when issuer
    (let [normalized-issuer (normalize-issuer issuer)
          cached (get @discovery-cache normalized-issuer)]
      (if (and cached (not (cache-expired? cached)))
        (do
          (log/debugf "Using cached discovery document for issuer %s" normalized-issuer)
          (:document cached))
        (do
          (when cached
            (log/infof "Discovery cache expired for issuer %s, re-fetching" normalized-issuer))
          (when-let [doc (fetch-discovery-document normalized-issuer)]
            (swap! discovery-cache assoc normalized-issuer {:document doc :fetched-at (t/to-millis-from-epoch (t/instant))})
            doc))))))

(defn- get-endpoint
  "Extract an endpoint from the discovery document or manual configuration.

   Parameters:
   - config: Map containing either :discovery-document or manual endpoint configurations
   - discovery-key: Key in the discovery document (e.g., :authorization_endpoint)
   - manual-key: Key in manual configuration (e.g., :authorization-endpoint)

   Returns the endpoint URL string or nil."
  [config discovery-key manual-key]
  (or (get-in config [:discovery-document discovery-key])
      (get config manual-key)))

(defn get-authorization-endpoint
  "Get the authorization endpoint from discovery document or manual config.

   Parameters:
   - config: Map with either :discovery-document or :authorization-endpoint

   Returns the authorization endpoint URL."
  [config]
  (get-endpoint config :authorization_endpoint :authorization-endpoint))

(defn get-token-endpoint
  "Get the token endpoint from discovery document or manual config.

   Parameters:
   - config: Map with either :discovery-document or :token-endpoint

   Returns the token endpoint URL."
  [config]
  (get-endpoint config :token_endpoint :token-endpoint))

(defn get-jwks-uri
  "Get the JWKS URI from discovery document or manual config.

   Parameters:
   - config: Map with either :discovery-document or :jwks-uri

   Returns the JWKS URI."
  [config]
  (get-endpoint config :jwks_uri :jwks-uri))

(defn validate-configuration
  "Validate that a configuration has all required endpoints.

   Parameters:
   - config: Configuration map (from discovery or manual)

   Returns true if all required endpoints are present, false otherwise."
  [config]
  (and (get-authorization-endpoint config)
       (get-token-endpoint config)
       (get-jwks-uri config)))
