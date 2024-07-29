(ns metabase.auth-provider
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [medley.core :as m]))

(def azure-auth-token-renew-slack-seconds
  "How many seconds before expiry we should prefer renewal.
  This is a fairly arbitrary value, it's used just to avoid situations when we decide to use an
  auth token which expires before we can put it to use."
  60)

(defmulti fetch-auth
  "Multimethod for auth-provider implementations.
   In general, implementations shouldn't change the shape of responses or names
   so that [[driver/incorporate-auth-provider-details]] can decide how to incorporate into details."
  (fn [auth-provider _database-id _db-details]
    auth-provider))

(defmethod fetch-auth :default
  [_auth-provider _database-id _db-details]
  nil)

(defn- parse-http-headers [headers]
  (json/parse-string headers))

(defn- ^:dynamic *fetch-as-json* [url headers]
  (let [headers (cond-> headers
                  (string? headers) parse-http-headers)
        response (http/get url (m/assoc-some {:as :json} :headers headers))]
    (:body response)))

(defmethod fetch-auth :http
  [_ _database-id {:keys [http-auth-url http-auth-headers]}]
  (*fetch-as-json* http-auth-url http-auth-headers))

(defmethod fetch-auth :oauth
  [_ _database-id {:keys [oauth-token-url oauth-token-headers]}]
  (*fetch-as-json* oauth-token-url oauth-token-headers))

(defmethod fetch-auth :azure-managed-identity
  [_ _database-id {:keys [azure-managed-identity-client-id]}]
  (*fetch-as-json* (str "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fossrdbms-aad.database.windows.net&client_id="
                        azure-managed-identity-client-id)
                   {"Metadata" "true"}))
