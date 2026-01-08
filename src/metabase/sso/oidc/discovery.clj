(ns metabase.sso.oidc.discovery
  "OIDC discovery document fetching and caching.

   Fetches and caches OpenID Connect discovery documents from provider issuers.
   Falls back to manual configuration when discovery is unavailable."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.util.log :as log]))

(def ^:private discovery-cache
  "Cache of discovery documents by issuer URL.
   Map of issuer URL string -> discovery document map."
  (atom {}))

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

(defn clear-issuer-cache!
  "Clear the cached discovery document for a specific issuer.
   Useful when an issuer's configuration changes."
  [issuer]
  (swap! discovery-cache dissoc (normalize-issuer issuer)))

(defn discover-oidc-configuration
  "Fetch and cache the OIDC discovery document for the given issuer.

   Parameters:
   - issuer: The issuer URL (e.g., \"https://accounts.google.com\")

   Returns the discovery document map or nil if discovery fails.
   Results are cached per issuer to avoid repeated requests."
  [issuer]
  (when issuer
    (let [normalized-issuer (normalize-issuer issuer)]
      (if-let [cached (get @discovery-cache normalized-issuer)]
        (do
          (log/debugf "Using cached discovery document for issuer %s" normalized-issuer)
          cached)
        (when-let [doc (fetch-discovery-document normalized-issuer)]
          (swap! discovery-cache assoc normalized-issuer doc)
          doc)))))

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

(defn get-userinfo-endpoint
  "Get the userinfo endpoint from discovery document or manual config.

   Parameters:
   - config: Map with either :discovery-document or :userinfo-endpoint

   Returns the userinfo endpoint URL."
  [config]
  (get-endpoint config :userinfo_endpoint :userinfo-endpoint))

(defn configuration-from-issuer
  "Build a configuration map from an issuer URL.
   Attempts discovery and returns a map with the discovery document.

   Parameters:
   - issuer: The OIDC issuer URL

   Returns a map with :discovery-document if discovery succeeds, otherwise nil."
  [issuer]
  (when-let [doc (discover-oidc-configuration issuer)]
    {:discovery-document doc}))

(defn configuration-from-manual
  "Build a configuration map from manually specified endpoints.

   Parameters:
   - endpoints: Map with keys :authorization-endpoint, :token-endpoint, :jwks-uri, :userinfo-endpoint

   Returns the endpoints map."
  [endpoints]
  endpoints)

(defn validate-configuration
  "Validate that a configuration has all required endpoints.

   Parameters:
   - config: Configuration map (from discovery or manual)

   Returns true if all required endpoints are present, false otherwise."
  [config]
  (and (get-authorization-endpoint config)
       (get-token-endpoint config)
       (get-jwks-uri config)))
