(ns metabase-enterprise.auth-provider.impl
  (:require
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util.http :as u.http]))

(defmulti ^:private fetch-auth*
  "Multimethod for auth-provider implementations.
   In general, implementations shouldn't change the shape of responses or names
   so that [[driver/incorporate-auth-provider-details]] can decide how to incorporate into details."
  {:arglists '([auth-provider database-id db-details])}
  (fn [auth-provider _database-id _db-details]
    auth-provider))

(defmethod fetch-auth* :default
  [_auth-provider _database-id _db-details]
  nil)

(defn- fetch-json!
  [url headers]
  (if (premium-features/is-hosted?)
    (u.http/*fetch-as-json* url headers :external-only)
    (u.http/*fetch-as-json* url headers)))

(defmethod fetch-auth* :http
  [_ _database-id {:keys [http-auth-url http-auth-headers]}]
  (fetch-json! http-auth-url http-auth-headers))

(defmethod fetch-auth* :oauth
  [_ _database-id {:keys [oauth-token-url oauth-token-headers]}]
  (fetch-json! oauth-token-url oauth-token-headers))

(defmethod fetch-auth* :azure-managed-identity
  [_ _database-id {:keys [azure-managed-identity-client-id]}]
  (fetch-json! (str "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fossrdbms-aad.database.windows.net&client_id="
                    azure-managed-identity-client-id)
               {"Metadata" "true"}))

(defenterprise fetch-auth
  "Fetches a response from an authentication provider."
  :feature :database-auth-providers
  [driver database-id db-details]
  (fetch-auth* driver database-id db-details))
