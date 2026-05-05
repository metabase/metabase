(ns metabase.oauth-server.store
  "Database-backed implementations of OAuth provider storage protocols."
  (:require
   [metabase.util :as u]
   [oidc-provider.protocol :as proto]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers ----------------------------------------------------------

(defn- parse-user-id
  "Parse a user-id string to a long, returning nil if not a valid positive integer.
   The oidc-provider library passes user-id as a string. For most grants this is a
   stringified Metabase user ID. We don't support client_credentials yet, but when we
   do the library will pass the client-id (a UUID) which is not a valid integer — the
   lenient nil return keeps this path open."
  [user-id]
  (let [s (str user-id)]
    (when (re-matches #"[1-9]\d*" s)
      (Long/parseLong s))))

(defn- parse-user-id-or-throw
  "Like [[parse-user-id]] but throws if the user-id is missing or not a valid positive integer.
   Use this in flows (e.g. authorization_code) where a real user must be present."
  [user-id]
  (or (parse-user-id user-id)
      (throw (ex-info "Expected a valid user ID, but it was not a positive integer"
                      {:user-id user-id}))))

(def ^:private client-db-columns
  "DB columns to select/project for OAuthClient rows."
  [:client_id :client_type :redirect_uris :grant_types :response_types :scopes :registration_type
   :client_secret_hash :token_endpoint_auth_method :client_name :client_uri :logo_uri
   :contacts :registration_access_token_hash :application_type])

(defn- select-and-kebab-keys
  "Select `ks` from `row`, convert keys to kebab-case, and remove nil values."
  [row ks]
  (-> (select-keys row ks)
      (update-keys u/->kebab-case-en)
      (->> (into {} (remove (comp nil? val))))))

(defn- kebab->snake-keys
  "Convert all keys in `m` from kebab-case to snake_case."
  [m]
  (update-keys m u/->snake_case_en))

(defn- db-row->client-config
  "Convert a DB row from :model/OAuthClient to the protocol's ClientConfig shape.
   Aliases :registration-access-token-hash as :registration-access-token so that
   the oidc-provider library can find the hash where it expects it."
  [row]
  (when row
    (let [m          (select-and-kebab-keys row client-db-columns)
          token-hash (:registration-access-token-hash m)]
      (cond-> m
        token-hash (assoc :registration-access-token token-hash)))))

(defn- client-config->db-row
  "Convert a protocol ClientConfig map to DB column format for insert/update."
  [config]
  (-> config
      (update :registration-type #(or % "static"))
      (select-keys (map u/->kebab-case-en client-db-columns))
      kebab->snake-keys))

(def ^:private auth-code-db-columns
  [:user_id :client_id :redirect_uri :scope :nonce :expiry
   :code_challenge :code_challenge_method :resource])

(defn- db-row->auth-code
  "Convert a DB row from :model/OAuthAuthorizationCode to the protocol's map shape.
   Converts user-id to a string since the oidc-provider library expects string user IDs.
   Ensures :resource is a vector (JSON deserialization may return a list)."
  [row]
  (when row
    (-> (select-and-kebab-keys row auth-code-db-columns)
        (update :user-id #(some-> % str))
        (u/update-if-exists :resource vec))))

(def ^:private access-token-db-columns
  [:user_id :client_id :scope :expiry :resource])

(defn- db-row->access-token
  "Convert a DB row from :model/OAuthAccessToken to the protocol's map shape."
  [row]
  (when row
    (-> (select-and-kebab-keys row access-token-db-columns)
        (update :user-id #(some-> % str))
        (u/update-if-exists :resource vec))))

(def ^:private refresh-token-db-columns
  [:user_id :client_id :scope :expiry :resource])

(defn- db-row->refresh-token
  "Convert a DB row from :model/OAuthRefreshToken to the protocol's map shape."
  [row]
  (when row
    (-> (select-and-kebab-keys row refresh-token-db-columns)
        (update :user-id #(some-> % str))
        (u/update-if-exists :resource vec))))

;;; ------------------------------------------------ ClientStore -------------------------------------------------------

(defrecord DbClientStore []
  proto/ClientStore
  (get-client [_ client-id]
    (-> (t2/select-one :model/OAuthClient :client_id client-id)
        db-row->client-config))

  (register-client [_ client-config]
    (let [client-id (or (:client-id client-config)
                        (str (java.util.UUID/randomUUID)))
          config    (-> client-config
                        (assoc :client-id client-id)
                        (cond->
                          ;; The library pre-hashes the registration-access-token before calling
                          ;; register-client; map it to the DB column name.
                         (:registration-access-token client-config)
                          (-> (assoc :registration-access-token-hash (:registration-access-token client-config))
                              (dissoc :registration-access-token))
                          ;; The library pre-hashes the client-secret before calling register-client;
                          ;; map it to the DB column name.
                          (:client-secret client-config)
                          (-> (assoc :client-secret-hash (:client-secret client-config))
                              (dissoc :client-secret))))
          row       (client-config->db-row config)]
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
                         :user_id      (parse-user-id-or-throw user-id)
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
    true)

  (consume-authorization-code [_ code]
    (t2/with-transaction [_conn]
      (when-let [row (t2/select-one :model/OAuthAuthorizationCode :code code {:for :update})]
        (t2/delete! :model/OAuthAuthorizationCode :code code)
        (db-row->auth-code row)))))

;;; ------------------------------------------------ TokenStore --------------------------------------------------------

(defrecord DbTokenStore []
  proto/TokenStore
  (save-access-token [_ token user-id client-id scope expiry resource]
    (t2/insert! :model/OAuthAccessToken
                (cond-> {:token     token
                         :user_id   (parse-user-id user-id)
                         :client_id client-id
                         :scope     (vec scope)
                         :expiry    expiry}
                  resource (assoc :resource (vec resource))))
    true)

  (get-access-token [_ token]
    (-> (t2/select-one :model/OAuthAccessToken :token token :revoked_at nil)
        db-row->access-token))

  (save-refresh-token [_ token user-id client-id scope expiry resource]
    (t2/insert! :model/OAuthRefreshToken
                (cond-> {:token     token
                         :user_id   (parse-user-id user-id)
                         :client_id client-id
                         :scope     (vec scope)}
                  expiry   (assoc :expiry expiry)
                  resource (assoc :resource (vec resource))))
    true)

  (get-refresh-token [_ token]
    (-> (t2/select-one :model/OAuthRefreshToken :token token :revoked_at nil)
        db-row->refresh-token))

  (revoke-token [_ token]
    (t2/update! :model/OAuthAccessToken {:token token} {:revoked_at :%now})
    (t2/update! :model/OAuthRefreshToken {:token token} {:revoked_at :%now})
    true))

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
