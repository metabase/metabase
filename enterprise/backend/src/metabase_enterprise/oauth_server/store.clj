(ns metabase-enterprise.oauth-server.store
  "Database-backed implementations of OIDC provider storage protocols."
  (:require
   [metabase-enterprise.oauth-server.models.oauth-access-token]
   [metabase-enterprise.oauth-server.models.oauth-authorization-code]
   [metabase-enterprise.oauth-server.models.oauth-client]
   [metabase-enterprise.oauth-server.models.oauth-refresh-token]
   [oidc-provider.protocol :as proto]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers ----------------------------------------------------------

(defn- db-row->client-config
  "Convert a DB row from :model/OAuthClient to the protocol's ClientConfig shape."
  [row]
  (when row
    (cond-> {:client-id                    (:client_id row)
             :redirect-uris                (vec (:redirect_uris row))
             :grant-types                  (vec (:grant_types row))
             :response-types               (vec (:response_types row))
             :scopes                       (vec (:scopes row))
             :registration-type            (:registration_type row)}
      (:client_secret_hash row)              (assoc :client-secret-hash (:client_secret_hash row))
      (:token_endpoint_auth_method row)      (assoc :token-endpoint-auth-method (:token_endpoint_auth_method row))
      (:client_name row)                     (assoc :client-name (:client_name row))
      (:client_uri row)                      (assoc :client-uri (:client_uri row))
      (:logo_uri row)                        (assoc :logo-uri (:logo_uri row))
      (:contacts row)                        (assoc :contacts (vec (:contacts row)))
      (:registration_access_token_hash row)  (assoc :registration-access-token-hash (:registration_access_token_hash row)))))

(defn- client-config->db-row
  "Convert a protocol ClientConfig map to DB column format for insert/update."
  [config]
  (cond-> {:client_id         (:client-id config)
           :redirect_uris     (:redirect-uris config)
           :grant_types       (:grant-types config)
           :response_types    (:response-types config)
           :scopes            (:scopes config)
           :registration_type (or (:registration-type config) "static")}
    (contains? config :client-secret-hash)              (assoc :client_secret_hash (:client-secret-hash config))
    (contains? config :token-endpoint-auth-method)      (assoc :token_endpoint_auth_method (:token-endpoint-auth-method config))
    (contains? config :client-name)                     (assoc :client_name (:client-name config))
    (contains? config :client-uri)                      (assoc :client_uri (:client-uri config))
    (contains? config :logo-uri)                        (assoc :logo_uri (:logo-uri config))
    (contains? config :contacts)                        (assoc :contacts (:contacts config))
    (contains? config :registration-access-token-hash)  (assoc :registration_access_token_hash (:registration-access-token-hash config))))

(defn- db-row->auth-code
  "Convert a DB row from :model/OAuthAuthorizationCode to the protocol's map shape."
  [row]
  (when row
    (cond-> {:user-id      (:user_id row)
             :client-id    (:client_id row)
             :redirect-uri (:redirect_uri row)
             :scope        (vec (:scope row))
             :nonce        (:nonce row)
             :expiry       (:expiry row)}
      (:code_challenge row)        (assoc :code-challenge (:code_challenge row))
      (:code_challenge_method row) (assoc :code-challenge-method (:code_challenge_method row))
      (:resource row)              (assoc :resource (vec (:resource row))))))

(defn- db-row->access-token
  "Convert a DB row from :model/OAuthAccessToken to the protocol's map shape."
  [row]
  (when row
    (cond-> {:user-id   (:user_id row)
             :client-id (:client_id row)
             :scope     (vec (:scope row))
             :expiry    (:expiry row)}
      (:resource row) (assoc :resource (vec (:resource row))))))

(defn- db-row->refresh-token
  "Convert a DB row from :model/OAuthRefreshToken to the protocol's map shape."
  [row]
  (when row
    (cond-> {:user-id   (:user_id row)
             :client-id (:client_id row)
             :scope     (vec (:scope row))}
      (:resource row) (assoc :resource (vec (:resource row))))))

;;; ------------------------------------------------ ClientStore -------------------------------------------------------

(defrecord DbClientStore []
  proto/ClientStore
  (get-client [_ client-id]
    (-> (t2/select-one :model/OAuthClient :client_id client-id)
        db-row->client-config))

  (register-client [_ client-config]
    (let [client-id    (or (:client-id client-config)
                           (str (java.util.UUID/randomUUID)))
          secret-hash  (when-let [secret (:client-secret client-config)]
                         (oidc-util/hash-client-secret secret))
          config       (-> client-config
                           (assoc :client-id client-id)
                           (cond-> secret-hash (assoc :client-secret-hash secret-hash))
                           (dissoc :client-secret))
          row          (client-config->db-row config)]
      (t2/insert! :model/OAuthClient row)
      config))

  (update-client [_ client-id updated-config]
    (let [existing (t2/select-one :model/OAuthClient :client_id client-id)]
      (when existing
        (let [existing-config (db-row->client-config existing)
              merged          (-> (merge existing-config updated-config)
                                  (assoc :client-id client-id))
              row             (client-config->db-row merged)]
          (t2/update! :model/OAuthClient (:id existing) row)
          merged)))))

;;; ----------------------------------------- AuthorizationCodeStore ---------------------------------------------------

(defrecord DbAuthorizationCodeStore []
  proto/AuthorizationCodeStore
  (save-authorization-code [_ code user-id client-id redirect-uri scope nonce expiry code-challenge code-challenge-method resource]
    (t2/insert! :model/OAuthAuthorizationCode
                (cond-> {:code         code
                         :user_id      user-id
                         :client_id    client-id
                         :redirect_uri redirect-uri
                         :scope        (vec scope)
                         :nonce        nonce
                         :expiry       expiry}
                  code-challenge        (assoc :code_challenge code-challenge)
                  code-challenge-method (assoc :code_challenge_method code-challenge-method)
                  resource              (assoc :resource (vec resource))))
    true)

  (get-authorization-code [_ code]
    (-> (t2/select-one :model/OAuthAuthorizationCode :code code)
        db-row->auth-code))

  (delete-authorization-code [_ code]
    (t2/delete! :model/OAuthAuthorizationCode :code code)
    true))

;;; ------------------------------------------------ TokenStore --------------------------------------------------------

(defrecord DbTokenStore []
  proto/TokenStore
  (save-access-token [_ token user-id client-id scope expiry resource]
    (t2/insert! :model/OAuthAccessToken
                (cond-> {:token     token
                         :user_id   user-id
                         :client_id client-id
                         :scope     (vec scope)
                         :expiry    expiry}
                  resource (assoc :resource (vec resource))))
    true)

  (get-access-token [_ token]
    (-> (t2/select-one :model/OAuthAccessToken :token token :revoked_at nil)
        db-row->access-token))

  (save-refresh-token [_ token user-id client-id scope resource]
    (t2/insert! :model/OAuthRefreshToken
                (cond-> {:token     token
                         :user_id   user-id
                         :client_id client-id
                         :scope     (vec scope)}
                  resource (assoc :resource (vec resource))))
    true)

  (get-refresh-token [_ token]
    (-> (t2/select-one :model/OAuthRefreshToken :token token :revoked_at nil)
        db-row->refresh-token))

  (revoke-token [_ token]
    (let [now (java.time.OffsetDateTime/now)]
      (t2/update! :model/OAuthAccessToken {:token token} {:revoked_at now})
      (t2/update! :model/OAuthRefreshToken {:token token} {:revoked_at now}))
    true))

;;; ---------------------------------------------- ClaimsProvider ------------------------------------------------------

(defrecord MetabaseClaimsProvider []
  proto/ClaimsProvider
  (get-claims [_ user-id scope]
    (let [scope-set (set scope)
          user      (t2/select-one [:model/User :id :first_name :last_name :email] :id user-id)]
      (when user
        (cond-> {:sub (str user-id)}
          (scope-set "profile")
          (assoc :name               (str (:first_name user) " " (:last_name user))
                 :preferred_username (:email user))
          (scope-set "email")
          (assoc :email          (:email user)
                 :email_verified true))))))

;;; ------------------------------------------------ Constructors ------------------------------------------------------

(defn create-client-store
  "Creates a database-backed client store."
  []
  (->DbClientStore))

(defn create-authorization-code-store
  "Creates a database-backed authorization code store."
  []
  (->DbAuthorizationCodeStore))

(defn create-token-store
  "Creates a database-backed token store."
  []
  (->DbTokenStore))

(defn create-claims-provider
  "Creates a Metabase-backed claims provider."
  []
  (->MetabaseClaimsProvider))
