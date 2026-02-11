(ns metabase-enterprise.sso.providers.oidc
  "Generic OIDC authentication provider backed by the `oidc-providers` setting.
   Derives from the base OIDC provider and adds per-provider configuration and claim extraction."
  (:require
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.premium-features.core :as premium-features]
   [metabase.sso.core :as sso]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Provider Registration --------------------------------------------------

(derive :provider/custom-oidc :provider/oidc)

;;; -------------------------------------------------- Configuration --------------------------------------------------

(defn- build-oidc-config
  "Build OIDC configuration map from provider settings."
  [provider-config request]
  (when (and (:client-id provider-config)
             (:client-secret provider-config)
             (:issuer-uri provider-config))
    (let [attribute-map (:attribute-map provider-config)]
      (cond-> {:client-id     (:client-id provider-config)
               :client-secret (:client-secret provider-config)
               :issuer-uri    (:issuer-uri provider-config)
               :scopes        (or (:scopes provider-config) ["openid" "email" "profile"])
               :redirect-uri  (:redirect-uri request)}
        (get attribute-map "email")
        (assoc :attribute-email (get attribute-map "email"))

        (get attribute-map "first_name")
        (assoc :attribute-firstname (get attribute-map "first_name"))

        (get attribute-map "last_name")
        (assoc :attribute-lastname (get attribute-map "last_name"))))))

;;; -------------------------------------------------- Authentication Implementation --------------------------------------------------

(methodical/defmethod auth-identity/authenticate :provider/custom-oidc
  [_provider request]
  (let [slug (:oidc-provider-slug request)]
    (cond
      (not (premium-features/enable-sso-oidc?))
      {:success? false
       :error :feature-not-available
       :message (tru "OIDC authentication is not available on your plan")}

      (not slug)
      {:success? false
       :error :missing-provider
       :message (tru "OIDC provider slug is required")}

      :else
      (let [provider-config (sso-settings/get-oidc-provider slug)]
        (cond
          (not provider-config)
          {:success? false
           :error :provider-not-found
           :message (tru "OIDC provider ''{0}'' not found" slug)}

          (not (:enabled provider-config))
          {:success? false
           :error :provider-not-enabled
           :message (tru "OIDC provider ''{0}'' is not enabled" slug)}

          :else
          (let [oidc-config (build-oidc-config provider-config request)]
            (if-not oidc-config
              {:success? false
               :error :configuration-error
               :message (tru "Failed to build OIDC configuration for provider ''{0}''" slug)}

              (let [auth-result (next-method _provider (assoc request :oidc-config oidc-config))]
                (if (and (:success? auth-result)
                         (:user-data auth-result))
                  (assoc-in auth-result [:user-data :sso_source] :oidc)
                  auth-result)))))))))

;;; -------------------------------------------------- Login Implementation --------------------------------------------------

(methodical/defmethod auth-identity/login! :provider/custom-oidc
  [provider {:keys [user oidc-provider-slug] :as request}]
  (when-not user
    (let [provider-config (sso-settings/get-oidc-provider oidc-provider-slug)
          auto-provision? (get provider-config :auto-provision true)]
      (sso-utils/maybe-throw-user-provisioning auto-provision?)))
  (next-method provider request))

(defn- group-names->ids
  "Translate a user's group names to a set of Metabase group IDs using the provider's group mappings."
  [group-names group-mappings]
  (->> (cond-> group-names (string? group-names) vector)
       (map keyword)
       (mapcat group-mappings)
       set))

(defn- all-mapped-group-ids
  "Returns the set of all Metabase group IDs that have configured mappings for the given provider."
  [group-mappings]
  (-> group-mappings vals flatten set))

(methodical/defmethod auth-identity/login! :after :provider/custom-oidc
  [_provider result]
  ;; Handle group sync if configured
  (when-let [slug (:oidc-provider-slug result)]
    (when-let [provider-config (sso-settings/get-oidc-provider slug)]
      (when (get-in provider-config [:group-sync :enabled])
        (let [group-attribute (get-in provider-config [:group-sync :group-attribute])
              group-mappings  (get-in provider-config [:group-sync :group-mappings])
              claims          (:claims result)
              user-groups     (when (and claims group-attribute)
                                (get claims (keyword group-attribute)))]
          (when (and user-groups group-mappings (:user result))
            (let [groups-to-sync (if (sequential? user-groups) user-groups [user-groups])]
              (if (empty? group-mappings)
                (sso/sync-group-memberships! (:user result) (group-names->ids groups-to-sync group-mappings))
                (sso/sync-group-memberships! (:user result)
                                             (group-names->ids groups-to-sync group-mappings)
                                             (all-mapped-group-ids group-mappings)))))))))
  result)
