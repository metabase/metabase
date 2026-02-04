(ns metabase-enterprise.impersonation.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.impersonation.credentials :as impersonation.credentials]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.secrets.core :as secret]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- ->trimmed
  [value]
  (some-> value str/trim))

(defn- ensure-credential-impersonation-supported!
  [database]
  (api/check-400 (driver.u/supports? (:engine database) :connection-impersonation/credentials database)
                 (tru "This database does not support credential-based impersonation.")))

(defn- credential->response
  [{:keys [token_secret_id oauth_secret_id] :as credential}]
  (cond-> (select-keys credential
                       [:id :db_id :key :auth_type :oauth_client_id :created_at :updated_at])
    true (assoc :has_token (some? token_secret_id)
                :has_oauth_secret (some? oauth_secret_id))))

(defn- upsert-secret!
  [existing-id name kind value]
  (:id (secret/upsert-secret-value! existing-id name kind :uploaded value)))

(defn- delete-secret!
  [secret-id]
  (when secret-id
    (t2/delete! :model/Secret :id secret-id)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of all Impersonation policies currently in effect, or a single policy if both `group_id` and `db_id`
  are provided."
  [_route-params
   {:keys [group_id db_id]} :- [:map
                                [:group_id {:optional true} [:maybe ms/PositiveInt]]
                                [:db_id    {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-superuser)
  (if (and group_id db_id)
    (t2/select-one :model/ConnectionImpersonation :group_id group_id :db_id db_id)
    (t2/select :model/ConnectionImpersonation {:order-by [[:id :asc]]})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/credentials"
  "Fetch credential-based connection impersonation profiles for a database."
  [_route-params
   {:keys [db_id]} :- [:map
                       [:db_id ms/PositiveInt]]]
  (api/check-superuser)
  (let [database (api/check-404 (t2/select-one :model/Database :id db_id))]
    (ensure-credential-impersonation-supported! database)
    (->> (t2/select :model/DatabaseImpersonationCredential
                    :db_id db_id
                    {:order-by [[:key :asc]]})
         (map credential->response))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/credentials"
  "Create or update a credential-based impersonation profile for a database."
  [_route-params
   _query-params
   {:keys [db_id key auth_type token oauth_client_id oauth_secret]} :- [:map
                                                                        [:db_id ms/PositiveInt]
                                                                        [:key ms/NonBlankString]
                                                                        [:auth_type {:optional true} [:enum "pat" "oauth-m2m"]]
                                                                        [:token {:optional true} [:maybe ms/NonBlankString]]
                                                                        [:oauth_client_id {:optional true} [:maybe ms/NonBlankString]]
                                                                        [:oauth_secret {:optional true} [:maybe ms/NonBlankString]]]]
  (api/check-superuser)
  (let [database (api/check-404 (t2/select-one :model/Database :id db_id))
        _ (ensure-credential-impersonation-supported! database)
        trimmed-key (->trimmed key)
        _ (api/check-400 (seq trimmed-key) (tru "Impersonation key is required."))
        _ (api/check-400 (<= (count trimmed-key) 254)
                         (tru "Impersonation key must be 254 characters or fewer."))
        auth-type (keyword (or auth_type "pat"))
        existing (impersonation.credentials/credential-for-key db_id trimmed-key)]
    (case auth-type
      :pat
      (let [trimmed-token (->trimmed token)]
        (api/check-400 (seq trimmed-token) (tru "Token is required for PAT authentication."))
        (let [secret-id (upsert-secret!
                         (:token_secret_id existing)
                         (format "Databricks PAT for %s (%s)" (:name database) trimmed-key)
                         :databricks-pat
                         trimmed-token)
              update-map {:db_id            db_id
                          :key              trimmed-key
                          :auth_type        :pat
                          :token_secret_id  secret-id
                          :oauth_client_id  nil
                          :oauth_secret_id  nil}]
          (when (and existing (not= (:auth_type existing) :pat))
            (delete-secret! (:oauth_secret_id existing)))
          (if existing
            (t2/update! :model/DatabaseImpersonationCredential :id (:id existing) update-map)
            (t2/insert! :model/DatabaseImpersonationCredential update-map))
          (sql-jdbc.conn/invalidate-impersonation-pool! db_id trimmed-key)
          (credential->response (impersonation.credentials/credential-for-key db_id trimmed-key))))

      :oauth-m2m
      (let [trimmed-client-id (->trimmed oauth_client_id)
            trimmed-secret (->trimmed oauth_secret)]
        (api/check-400 (seq trimmed-client-id) (tru "OAuth client ID is required."))
        (api/check-400 (seq trimmed-secret) (tru "OAuth secret is required."))
        (let [secret-id (upsert-secret!
                         (:oauth_secret_id existing)
                         (format "Databricks OAuth secret for %s (%s)" (:name database) trimmed-key)
                         :databricks-oauth-secret
                         trimmed-secret)
              update-map {:db_id           db_id
                          :key             trimmed-key
                          :auth_type       :oauth-m2m
                          :oauth_client_id trimmed-client-id
                          :oauth_secret_id secret-id
                          :token_secret_id nil}]
          (when (and existing (not= (:auth_type existing) :oauth-m2m))
            (delete-secret! (:token_secret_id existing)))
          (if existing
            (t2/update! :model/DatabaseImpersonationCredential :id (:id existing) update-map)
            (t2/insert! :model/DatabaseImpersonationCredential update-map))
          (sql-jdbc.conn/invalidate-impersonation-pool! db_id trimmed-key)
          (credential->response (impersonation.credentials/credential-for-key db_id trimmed-key))))

      (throw (ex-info (tru "Unsupported impersonation auth type: {0}." (name auth-type))
                      {:status-code 400
                       :auth_type auth-type})))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/credentials/:id"
  "Delete a credential-based impersonation profile."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [credential (api/check-404 (t2/select-one :model/DatabaseImpersonationCredential :id id))]
    (delete-secret! (:token_secret_id credential))
    (delete-secret! (:oauth_secret_id credential))
    (t2/delete! :model/DatabaseImpersonationCredential :id id)
    (sql-jdbc.conn/invalidate-impersonation-pool! (:db_id credential) (:key credential)))
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a Connection Impersonation entry."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ConnectionImpersonation :id id))
  (t2/delete! :model/ConnectionImpersonation :id id)
  api/generic-204-no-content)
