(ns metabase-enterprise.sso.providers.jwt
  "JWT authentication provider implementation."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.settings.core :as setting]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Register JWT provider
(derive :provider/jwt :metabase.auth-identity.provider/provider)
(derive :provider/jwt :metabase.auth-identity.provider/create-user-if-not-exists)
(derive :provider/jwt :metabase-enterprise.tenants.auth-provider/create-tenant-if-not-exists)

;; JWTs use seconds since Epoch, not milliseconds since Epoch for the `iat` and `max_age` time.
;; 3 minutes is the time used by Zendesk for their JWT SSO
(def ^:private ^:const three-minutes-in-seconds 180)

(def ^:private ^{:arglists '([])} jwt-attribute-email
  (comp keyword sso-settings/jwt-attribute-email))

(def ^:private ^{:arglists '([])} jwt-attribute-firstname
  (comp keyword sso-settings/jwt-attribute-firstname))

(def ^:private ^{:arglists '([])} jwt-attribute-lastname
  (comp keyword sso-settings/jwt-attribute-lastname))

(def ^:private ^{:arglists '([])} jwt-attribute-groups
  (comp keyword sso-settings/jwt-attribute-groups))

(def ^:private ^{:arglists '([])} jwt-attribute-tenant
  (comp keyword sso-settings/jwt-attribute-tenant))

(def ^:private ^{:arglists '([])} jwt-attribute-tenant-attributes
  (comp keyword sso-settings/jwt-attribute-tenant-attributes))

(def ^:private registered-claims
  "Registered claims in the JWT standard which we should not interpret as login attributes."
  [:iss :iat :sub :aud :exp :nbf :jti])

(defn- jwt-data->user-attributes
  "Extract user attributes from JWT data, excluding standard claims and user identity fields."
  [jwt-data]
  (let [excluded-keys (concat registered-claims
                              [(jwt-attribute-email)
                               (jwt-attribute-firstname)
                               (jwt-attribute-lastname)
                               (jwt-attribute-groups)]
                              (when (setting/get :use-tenants)
                                [(jwt-attribute-tenant)
                                 (jwt-attribute-tenant-attributes)]))]
    (sso-utils/stringify-valid-attributes (apply dissoc jwt-data excluded-keys))))

(defn- extract-tenant-attributes
  "Extract and stringify tenant attributes from JWT data. Returns nil if not a map."
  [jwt-data]
  (let [attrs (get jwt-data (jwt-attribute-tenant-attributes))]
    (when (map? attrs)
      (sso-utils/stringify-valid-attributes attrs))))

(defn- decode-and-verify-jwt
  "Decode and verify a JWT token. Returns the JWT data if valid, throws on error."
  [token]
  (try
    (jwt/unsign token (sso-settings/jwt-shared-secret)
                {:max-age three-minutes-in-seconds})
    (catch Throwable e
      (throw (ex-info (ex-message e)
                      {:status-code 401
                       :error :invalid-jwt})))))

(methodical/defmethod auth-identity/authenticate :provider/jwt
  [_provider {:keys [token] :as _request}]
  (cond
    (not (sso-settings/jwt-enabled-and-configured))
    {:success? false
     :error :jwt-not-enabled
     :message (str (tru "JWT authentication is not enabled"))}

    (not token)
    {:success? false
     :error :invalid-request
     :message "JWT token is required"}

    :else
    (try
      (let [jwt-data (decode-and-verify-jwt token)
            email (get jwt-data (jwt-attribute-email))
            first-name (get jwt-data (jwt-attribute-firstname))
            last-name (get jwt-data (jwt-attribute-lastname))
            tenant-slug (u/prog1 (get jwt-data (jwt-attribute-tenant))
                          (when-not (or (nil? <>)
                                        (string? <>)
                                        (integer? <>))
                            (throw (ex-info "Value of `@tenant` must be a string" {:status-code 400
                                                                                   :error :invalid-tenant}))))
            tenant-attributes (extract-tenant-attributes jwt-data)
            user-attributes (jwt-data->user-attributes jwt-data)]
        (when-not email
          (throw (ex-info (tru "JWT token missing email claim")
                          {:status-code 400
                           :error :missing-email})))
        (log/infof "Successfully authenticated JWT token for: %s %s" first-name last-name)
        {:success? true
         :tenant-slug (some-> tenant-slug str)
         :tenant-attributes tenant-attributes
         :user-data (->> {:email email
                          :first_name first-name
                          :last_name last-name
                          :sso_source :jwt
                          :jwt_attributes user-attributes}
                         (remove #(nil? (val %)))
                         (into {}))
         :jwt-data jwt-data
         :provider-id email})
      (catch clojure.lang.ExceptionInfo e
        (log/errorf e "JWT authentication failed: %s" (.getMessage e))
        {:success? false
         :error (or (:error (ex-data e)) :authentication-failed)
         :message (.getMessage e)})
      (catch Exception e
        (log/errorf e "Unexpected error during JWT authentication: %s" (.getMessage e))
        {:success? false
         :error :server-error
         :message "An unexpected error occurred during authentication"}))))

(methodical/defmethod auth-identity/login! :provider/jwt
  "Handle jwt login aborting if user provisioning is not enabled and no user was found."
  [provider request]
  (cond
    ;; Authentication needs redirect (shouldn't happen for Google but handle it)
    (= :redirect (:success? request))
    request

    ;; Authentication failed
    (not (:success? request))
    request

    ;; Authentication succeeded - check account creation policy
    ;; TODO(edpaget): 2025/11/11 this should return an error condition instead of throwing
    :else
    (let [provisioning-enabled? (sso-settings/jwt-user-provisioning-enabled?)]
      (when-not (and (:user request) (get-in request [:user :is_active]))
        (sso-utils/check-user-provisioning :jwt))
      ;; If the user was deactivated but user provisioning is allowed reactive the user
      ;; Pass provisioning status for tenant reactivation logic
      (next-method provider (-> request
                                (assoc-in [:user-data :is_active] true)
                                (assoc :user-provisioning-enabled? provisioning-enabled?))))))

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names]
  (if-let [name-mappings (not-empty (sso-settings/jwt-group-mappings))]
    (set
     (mapcat name-mappings
             (map keyword group-names)))
    (t2/select-pks-set :model/PermissionsGroup :name [:in group-names])))

(defn- all-mapped-group-ids
  "Returns the set of all MB group IDs that have configured mappings"
  []
  (-> (sso-settings/jwt-group-mappings)
      vals
      flatten
      set))

(methodical/defmethod auth-identity/login! :after :provider/jwt
  "Sync JWT group memberships after successful login.

   This method runs after the main login! flow completes successfully.
   It extracts the JWT groups from the authentication result and syncs
   them with Metabase group memberships based on configured mappings."
  [_provider {:keys [jwt-data user] :as result}]
  (cond-> result
    (:success? result)
    (u/prog1
      (when (sso-settings/jwt-group-sync)
        (when-let [groups-attribute (jwt-attribute-groups)]
          (when-let [group-names (get jwt-data groups-attribute)]
            (if (empty? (sso-settings/jwt-group-mappings))
              (sso/sync-group-memberships! user (group-names->ids group-names))
              (sso/sync-group-memberships! user
                                           (group-names->ids group-names)
                                           (all-mapped-group-ids)))))))))
