(ns metabase.sso.providers.ldap
  "LDAP authentication provider implementation."
  (:require
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sso.core :as sso]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap.default-implementation :as ldap.impl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

;; Register LDAP provider in the hierarchy
(derive :provider/ldap :metabase.auth-identity.provider/provider)

;; LDAP is an SSO provider that auto-creates users
(derive :provider/ldap :metabase.auth-identity.provider/create-user-if-not-exists)

;;; -------------------------------------------------- Multimethod Implementations --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/ldap
  "Authenticate a user with LDAP.

   Request format:
     {:username \"jsmith\"
      :password \"secret123\"}

   Returns:
     Success: {:success? true
               :user-data {:email \"jsmith@company.com\"
                          :first_name \"John\"
                          :last_name \"Smith\"
                          :sso_source :ldap
                          :groups [\"cn=admins,ou=groups,dc=example,dc=com\"]}}

     Failure: {:success? false
               :error :invalid-credentials
               :message \"...\"}"
  [_provider {:keys [username password] :as _request}]
  (log/debugf "Authenticating with LDAP provider for username: %s" username)

  (cond
    (not username)
    {:success? false
     :error :invalid-credentials
     :message "Username is required"}

    (not password)
    {:success? false
     :error :invalid-credentials
     :message "Password is required"}

    :else
    (try
      ;; Find user in LDAP
      (if-let [user-info (ldap/find-user username)]
        ;; Verify password
        (if (ldap/verify-password user-info password)
          ;; Success - return user data for auto-provisioning, including groups
          {:success? true
           :user-data {:email (:email user-info)
                       :first_name (:first-name user-info)
                       :last_name (:last-name user-info)
                       :sso_source :ldap
                       :login_attributes (:attributes user-info)
                       :groups (:groups user-info)}
           :provider-id (:email user-info)}
          ;; Password didn't match
          {:success? false
           :error :invalid-credentials
           :message "Password did not match LDAP password."})
        ;; User not found in LDAP
        {:success? false
         :error :ldap-error
         :message "No user found with that username in LDAP."})
      (catch clojure.lang.ExceptionInfo e
        (log/error e "LDAP authentication error")
        {:success? false
         :error :ldap-error
         :message (or (ex-message e) "LDAP authentication failed")})
      (catch Exception e
        (log/error e "Unexpected error during LDAP authentication")
        {:success? false
         :error :server-error
         :message "An unexpected error occurred during authentication"}))))

(defenterprise check-provision-ldap
  "Throw if we cannot provision ldap users. Always nil on OSS."
  metabase-enterprise.sso.integrations.ldap
  []
  nil)

(methodical/defmethod auth-identity/login! :provider/ldap
  "Handle ldap login aborting if user provisioning enabled (when running enterprise edition) and no user was found."
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
    (do (when-not (and (:user request) (get-in request [:user :is_active]))
          (check-provision-ldap))
        (next-method provider request))))

(methodical/defmethod auth-identity/login! :after :provider/ldap
  "Sync LDAP group memberships after successful login.

   This method runs after the main login! flow completes successfully.
   It extracts the LDAP groups from the authentication result and syncs
   them with Metabase group memberships based on configured mappings."
  [_provider result]
  (u/prog1 result
    (when (and (:success? result)
               (:user result))
      (let [settings (ldap/ldap-settings)
            groups (get-in result [:user-data :groups])]
        (when (and (:sync-groups? settings) groups)
          (log/debugf "Syncing LDAP groups for user %s: %s" (get-in result [:user :id]) groups)
          (try
            (let [group-ids (ldap.impl/ldap-groups->mb-group-ids groups settings)
                  all-mapped-ids (ldap.impl/all-mapped-group-ids settings)]
              (sso/sync-group-memberships! (:user result) group-ids all-mapped-ids))
            (catch Exception e
              (log/error e "Error syncing LDAP group memberships"))))))))
