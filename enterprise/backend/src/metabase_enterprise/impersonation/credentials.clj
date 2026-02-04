(ns metabase-enterprise.impersonation.credentials
  (:require
   [clojure.string :as str]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.secrets.core :as secret]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/DatabaseImpersonationCredential [_model]
  :database_impersonation_credentials)

(t2/deftransforms :model/DatabaseImpersonationCredential
  {:auth_type mi/transform-keyword
   :details   mi/transform-json})

(doto :model/DatabaseImpersonationCredential
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(defn- secret-id->string
  [secret-id]
  (when secret-id
    (when-let [secret (secret/latest-for-id secret-id)]
      (let [value (:value secret)]
        (cond
          (nil? value) nil
          (string? value) value
          (bytes? value) (u/bytes-to-string value)
          :else (str value))))))

(defn- require-non-blank
  [value label context]
  (when (str/blank? value)
    (throw (ex-info (tru "{0} is missing for impersonation credentials." label)
                    context)))
  value)

(defn- require-secret
  [secret-id label context]
  (or (secret-id->string secret-id)
      (throw (ex-info (tru "{0} is missing for impersonation credentials." label)
                      (assoc context :secret-id secret-id)))))

(defn- credential-details
  [{:keys [details]}]
  (if (map? details) details {}))

(defenterprise credential-for-key
  "Fetch a single credential profile for a database and impersonation key."
  :feature :advanced-permissions
  [db-id impersonation-key]
  (t2/select-one :model/DatabaseImpersonationCredential
                 :db_id (u/the-id db-id)
                 :key impersonation-key))

(defenterprise databricks-connection-details
  "Build Databricks connection details for a given impersonation key."
  :feature :advanced-permissions
  [database impersonation-key]
  (let [db-id   (u/the-id database)
        context {:database-id db-id
                 :impersonation-key impersonation-key}
        credential (credential-for-key db-id impersonation-key)]
    (when-not credential
      (throw (ex-info (tru "No impersonation credentials found for key {0}." impersonation-key)
                      context)))
    (case (:auth_type credential)
      :pat
      (let [token (require-secret (:secret_id credential) (tru "Token secret") context)]
        (-> (:details database)
            (assoc :use-m2m false
                   :token token)
            (dissoc :client-id :oauth-secret)))

      :oauth-m2m
      (let [details (credential-details credential)
            client-id (require-non-blank (:oauth_client_id details) (tru "OAuth client ID") context)
            oauth-secret (require-secret (:secret_id credential) (tru "OAuth secret") context)]
        (-> (:details database)
            (assoc :use-m2m true
                   :client-id client-id
                   :oauth-secret oauth-secret)
            (dissoc :token)))

      (throw (ex-info (tru "Unsupported impersonation auth type: {0}." (:auth_type credential))
                      (assoc context :auth-type (:auth_type credential)))))))
