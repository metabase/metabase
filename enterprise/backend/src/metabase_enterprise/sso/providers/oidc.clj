(ns metabase-enterprise.sso.providers.oidc
  "Generic OIDC authentication provider backed by the `oidc-providers` setting.
   Derives from the base OIDC provider and adds per-provider configuration and claim extraction."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

(auth-identity/derive! :provider/custom-oidc :provider/oidc)

;;; -------------------------------------------------- Configuration --------------------------------------------------

(def ^:private max-provider-name-length
  "The width of `auth_identity.provider`."
  50)

(defn identity-provider-name
  "The AuthIdentity provider name for the custom OIDC provider with `provider-key`: `oidc-<key>`, or, when that would
  not fit `auth_identity.provider`, the key truncated and suffixed with a hash of the whole key."
  [provider-key]
  (let [full (str "oidc-" provider-key)]
    (if (<= (count full) max-provider-name-length)
      full
      (let [digest (subs (codecs/bytes->hex (buddy-hash/sha256 ^String provider-key)) 0 12)]
        (str (subs full 0 (- max-provider-name-length (count digest) 1)) "-" digest)))))

(defn- build-oidc-config
  "Build OIDC configuration map from provider settings."
  [provider-config request]
  (when (and (:client-id provider-config)
             (:client-secret provider-config)
             (:issuer-uri provider-config))
    ;; the stored setting decodes with keyword keys, and a blank claim falls back to the default
    (let [attribute-map (update-vals (update-keys (:attribute-map provider-config) name) u/not-blank)]
      ;; the email picks the account, and email_verified only covers the standard claim, so it is never remapped
      (cond-> {:client-id     (:client-id provider-config)
               :client-secret (:client-secret provider-config)
               :issuer-uri    (:issuer-uri provider-config)
               :scopes        (or (:scopes provider-config) ["openid" "email" "profile"])
               :redirect-uri  (:redirect-uri request)
               ;; per-IdP AuthIdentity namespace: every configured IdP shares the :provider/custom-oidc
               ;; dispatch keyword, so without this their (iss, sub) identities would collide in one row
               :identity-provider-name (identity-provider-name (:key provider-config))
               ;; AuthIdentity rows written before per-IdP provider names all used this shared name;
               ;; verify-or-link-identity! migrates a user's matching legacy row on their first login
               :legacy-provider-name "custom-oidc"}
        (get attribute-map "first_name")
        (assoc :attribute-firstname (get attribute-map "first_name"))

        (get attribute-map "last_name")
        (assoc :attribute-lastname (get attribute-map "last_name"))

        (some? (:auto-link-verified-email provider-config))
        (assoc :auto-link-verified-email (:auto-link-verified-email provider-config))

        (seq (:trusted-email-domains provider-config))
        (assoc :trusted-email-domains (:trusted-email-domains provider-config))))))

;;; -------------------------------------------------- Authentication Implementation --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/custom-oidc
  [_provider request]
  (let [provider-key (:oidc-provider-key request)]
    (cond
      (not (premium-features/enable-sso-oidc?))
      {:success? false
       :error :feature-not-available
       :message (tru "OIDC authentication is not available on your plan")}

      (not provider-key)
      {:success? false
       :error :missing-provider
       :message (tru "OIDC provider key is required")}

      :else
      (let [provider-config (sso-settings/get-oidc-provider provider-key)]
        (cond
          (not provider-config)
          {:success? false
           :error :provider-not-found
           :message (tru "OIDC provider ''{0}'' not found" provider-key)}

          (not (:enabled provider-config))
          {:success? false
           :error :provider-not-enabled
           :message (tru "OIDC provider ''{0}'' is not enabled" provider-key)}

          :else
          (let [oidc-config (build-oidc-config provider-config request)]
            (if-not oidc-config
              {:success? false
               :error :configuration-error
               :message (tru "Failed to build OIDC configuration for provider ''{0}''" provider-key)}
              (let [auth-result (next-method _provider (assoc request :oidc-config oidc-config))]
                (if (and (:success? auth-result)
                         (:user-data auth-result))
                  (assoc-in auth-result [:user-data :sso_source] :oidc)
                  auth-result)))))))))

;;; -------------------------------------------------- Login Implementation --------------------------------------------------

(methodical/defmethod auth-identity/login! :provider/custom-oidc
  [provider {:keys [user] :as request}]
  ;; only gate provisioning on successful authentications: a failure must surface its own error. An account-linking
  ;; flow never provisions, and reports a token email without an account itself.
  (when (and (true? (:success? request)) (not user) (not (:oidc-link-user-id request)))
    (sso-utils/check-user-provisioning :oidc))
  (let [provisioning-enabled? (sso-settings/oidc-user-provisioning-enabled?)
        user-was-deactivated? (and user (not (:is_active user)))
        reactivate-user?      (and user-was-deactivated?
                                   provisioning-enabled?)]
    (next-method provider (cond-> request
                            reactivate-user?
                            (-> (assoc-in [:user-data :is_active] true)
                                (assoc :user-provisioning-enabled? provisioning-enabled?))))))

(methodical/defmethod auth-identity/login! :after :provider/custom-oidc
  [_provider result]
  ;; Handle group sync if configured
  (when-let [provider-key (:oidc-provider-key result)]
    (when-let [provider-config (sso-settings/get-oidc-provider provider-key)]
      (let [group-sync-config (get provider-config :group-sync)]
        (when (:enabled group-sync-config)
          (let [group-attribute (get group-sync-config :group-attribute)
                group-mappings  (get group-sync-config :group-mappings)
                claims          (:claims result)
                user-groups     (when (and claims group-attribute)
                                  (or (get claims (keyword group-attribute))
                                      (get claims group-attribute)))]
            (when (and user-groups group-mappings (:user result))
              (let [groups-to-sync (if (sequential? user-groups) user-groups [user-groups])]
                (sso/sync-group-memberships! (:user result)
                                             (sso-utils/group-names->ids groups-to-sync group-mappings)
                                             (sso-utils/all-mapped-group-ids group-mappings)))))))))
  result)
