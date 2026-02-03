(ns metabase-enterprise.sso.providers.saml
  "SAML authentication provider implementation."
  (:require
   [medley.core :as m]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.settings.core :as setting]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [saml20-clj.core :as saml]))

(set! *warn-on-reflection* true)

;; Register SAML provider
(derive :provider/saml :metabase.auth-identity.provider/provider)
(derive :provider/saml :metabase.auth-identity.provider/create-user-if-not-exists)
(derive :provider/saml :metabase-enterprise.tenants.auth-provider/create-tenant-if-not-exists)

(defn- acs-url
  "Get the Assertion Consumer Service URL."
  []
  (str (system/site-url) "/auth/sso"))

(defn- sp-cert-keystore-details
  "Build a certificate store map usable by the saml20-clj library."
  []
  (when-let [path (sso-settings/saml-keystore-path)]
    (when-let [password (sso-settings/saml-keystore-password)]
      (when-let [key-name (sso-settings/saml-keystore-alias)]
        {:filename path
         :password password
         :alias key-name}))))

(defn- idp-cert
  "Get the Identity Provider certificate."
  []
  (or (sso-settings/saml-identity-provider-certificate)
      (throw (ex-info (str (tru "Unable to log in: SAML IdP certificate is not set."))
                      {:status-code 500}))))

(defn- unwrap-user-attributes
  "For some reason all of the user attributes coming back from the saml library are wrapped in a list,
   instead of 'Oisin', it's ('Oisin'). This function discards the list if there's just a single item in it."
  [m]
  (m/map-vals (fn [maybe-coll]
                (if (and (coll? maybe-coll)
                         (= 1 (count maybe-coll)))
                  (first maybe-coll)
                  maybe-coll))
              m))

(defn- saml-response->attributes
  "Extract user attributes from a SAML response."
  [saml-response]
  (let [assertions (saml/assertions saml-response)
        attrs (-> assertions first :attrs unwrap-user-attributes)]
    (when-not attrs
      (throw (ex-info (str (tru "Unable to log in: SAML info does not contain user attributes."))
                      {:status-code 401})))
    attrs))

(methodical/defmethod auth-identity/authenticate :provider/saml
  [_provider {:keys [redirect-url] :as request}]
  (cond
    (not (sso-settings/saml-enabled))
    {:success? false
     :error :saml-not-enabled
     :message (str (tru "SAML authentication is not enabled"))}

    ;; SAML AuthnRequest generation (GET flow - redirect to IdP)
    (= (:request-method request) :get)
    (try
      (let [idp-url (sso-settings/saml-identity-provider-uri)
            relay-state (when redirect-url
                          (u/encode-base64 redirect-url))
            response (saml/idp-redirect-response {:request-id (str "id-" (random-uuid))
                                                  :sp-name (sso-settings/saml-application-name)
                                                  :issuer (sso-settings/saml-application-name)
                                                  :acs-url (acs-url)
                                                  :idp-url idp-url
                                                  :credential (sp-cert-keystore-details)
                                                  :relay-state relay-state
                                                  :protocol-binding :post})]
        {:success? :redirect
         :redirect-url (get-in response [:headers "location"])
         :message "Redirecting to SAML provider"})
      (catch Throwable e
        (log/errorf e "Error generating SAML request: %s" (.getMessage e))
        {:success? false
         :error :saml-request-generation-failed
         :message (str (tru "Error generating SAML request"))}))

    ;; SAML Response validation (POST flow - validate and extract user data)
    :else
    (try
      (let [validated-response (saml/validate-response request
                                                       {:idp-cert (idp-cert)
                                                        :sp-private-key (sp-cert-keystore-details)
                                                        :acs-url (acs-url)
                                                        :response-validators [:issuer
                                                                              :signature
                                                                              :require-authenticated]
                                                        :assertion-validators [:signature
                                                                               :recipient
                                                                               :not-on-or-after
                                                                               :not-before
                                                                               :address
                                                                               :issuer]
                                                        :issuer (sso-settings/saml-identity-provider-issuer)})
            attrs (saml-response->attributes validated-response)
            email (get attrs (sso-settings/saml-attribute-email))
            first-name (get attrs (sso-settings/saml-attribute-firstname))
            last-name (get attrs (sso-settings/saml-attribute-lastname))
            groups (get attrs (sso-settings/saml-attribute-group))
            tenant-slug (when (and (not-empty (sso-settings/saml-attribute-tenant))
                                   (setting/get :use-tenants))
                          (get attrs (sso-settings/saml-attribute-tenant)))
            user-attributes (sso-utils/stringify-valid-attributes attrs)]
        (when-not email
          (throw (ex-info (str (tru "Invalid SAML configuration: could not find user email. We tried looking for {0}, but couldn''t find the attribute. Please make sure your SAML IdP is properly configured."
                                    (sso-settings/saml-attribute-email)))
                          {:status-code 400
                           :user-attributes (keys user-attributes)})))
        (log/infof "Successfully authenticated SAML assertion for: %s %s" first-name last-name)
        {:success? true
         :user-data {:email email
                     :first_name first-name
                     :last_name last-name
                     :sso_source :saml
                     :login_attributes user-attributes}
         :tenant-slug tenant-slug
         :saml-data {:group-names groups
                     :user-attributes user-attributes}
         :provider-id email})
      (catch clojure.lang.ExceptionInfo e
        (log/errorf e "SAML authentication failed: %s" (.getMessage e))
        {:success? false
         :error (or (:error (ex-data e)) :authentication-failed)
         :message (.getMessage e)})
      (catch Exception e
        (log/errorf e "Unexpected error during SAML authentication: %s" (.getMessage e))
        {:success? false
         :error :server-error
         :message (str (tru "Unable to log in: SAML response validation failed"))}))))

(methodical/defmethod auth-identity/login! :provider/saml
  "Handle saml login aborting if user provisioning is not enabled and no user was found."
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
    (let [provisioning-enabled? (sso-settings/saml-user-provisioning-enabled?)]
      (when-not (and (:user request) (get-in request [:user :is_active]))
        (sso-utils/check-user-provisioning :saml))
      ;; If the user was deactivated but user provisioning is allowed reactive the user
      ;; Pass provisioning status for tenant reactivation logic
      (next-method provider (-> request
                                (assoc-in [:user-data :is_active] true)
                                (assoc :user-provisioning-enabled? provisioning-enabled?))))))

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names]
  (->> (cond-> group-names (string? group-names) vector)
       (map keyword)
       (mapcat (sso-settings/saml-group-mappings))
       set))

(defn- all-mapped-group-ids
  "Returns the set of all MB group IDs that have configured mappings"
  []
  (-> (sso-settings/saml-group-mappings)
      vals
      flatten
      set))

(methodical/defmethod auth-identity/login! :after :provider/saml
  "Sync SAML group memberships after successful login.

   This method runs after the main login! flow completes successfully.
   It extracts the SAML groups from the authentication result and syncs
   them with Metabase group memberships based on configured mappings."
  [_provider {:keys [saml-data user] :as result}]
  (cond-> result
    (:success? result)
    (u/prog1
      (when (sso-settings/saml-group-sync)
        (when-let [group-names (:group-names saml-data)]
          (sso/sync-group-memberships! user
                                       (group-names->ids group-names)
                                       (all-mapped-group-ids)))))))
