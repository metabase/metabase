(ns metabase.premium-features.settings
  "Impls for settings that need to fetch token status live in [[metabase.premium-features.token-check]]."
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting site-uuid-for-premium-features-token-checks
  "In the interest of respecting everyone's privacy and keeping things as anonymous as possible we have a *different*
  site-wide UUID that we use for the EE/premium features token feature check API calls. It works in fundamentally the
  same way as [[site-uuid]] but should only be used by the token check logic
  in [[metabase.premium-features.core/fetch-token-status]]. (`site-uuid` is used for anonymous
  analytics aka stats and if we sent it along with the premium features token check API request it would no longer be
  anonymous.)"
  :encryption :when-encryption-key-set
  :visibility :internal
  :base       setting/uuid-nonce-base
  :doc        false)

(defsetting active-users-count
  (deferred-tru "Number of active users")
  :visibility :admin
  :type       :integer
  :audit      :never
  :setter     :none
  :default    0
  :export?    false
  :getter     (fn []
                ((requiring-resolve 'metabase.premium-features.token-check/-active-users-count))))

(defsetting token-status
  (deferred-tru "Cached token status for premium features. This is to avoid an API request on the the first page load.")
  :visibility :admin
  :type       :json
  :audit      :never
  :setter     :none
  :getter     (fn []
                ((requiring-resolve 'metabase.premium-features.token-check/-token-status))))

;;; TODO - rename this to premium-features-token?
(defsetting premium-embedding-token
  (deferred-tru "Token for premium features. Go to the MetaStore to get yours!")
  :audit :never
  :sensitive? true
  :setter (fn [new-value]
            ((requiring-resolve 'metabase.premium-features.token-check/-set-premium-embedding-token!) new-value)))

(defsetting airgap-enabled
  "Returns true if the current instance is airgapped."
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :export?    false
  :getter     (fn []
                ((requiring-resolve 'metabase.premium-features.token-check/-airgap-enabled))))

(defn- has-feature? [feature]
  ((requiring-resolve 'metabase.premium-features.token-check/has-feature?) feature))

(defsetting is-hosted?
  "Is the Metabase instance running in the cloud?"
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :getter     (fn [] (boolean
                      (and
                       (has-feature? :hosting)
                       (not (airgap-enabled)))))
  :doc        false)

(def ^:private premium-features
  "Set of defined premium feature keywords."
  (atom #{}))

(defn- default-premium-feature-getter [feature]
  (fn []
    (and config/ee-available?
         (has-feature? feature))))

(defmacro define-premium-feature
  "Convenience for generating a [[metabase.settings.models.setting/defsetting]] form for a premium token feature. (The Settings
  definitions for Premium token features all look more or less the same, so this prevents a lot of code duplication.)"
  [setting-name docstring feature & {:as options}]
  (let [options (merge {:type       :boolean
                        :visibility :public
                        :setter     :none
                        :audit      :never
                        :getter     `(default-premium-feature-getter ~(some-> feature name))}
                       options)]
    `(do
       (swap! premium-features conj ~feature)
       (defsetting ~setting-name
         ~docstring
         ~@(mapcat identity options)))))

(define-premium-feature hide-embed-branding?
  "Logo Removal and Full App Embedding. Should we hide the 'Powered by Metabase' attribution on the embedding pages?
   `true` if we have a valid premium embedding token."
  :embedding
  :export? true
  ;; This specific feature DOES NOT require the EE code to be present in order for it to return truthy, unlike
  ;; everything else.
  :getter #(has-feature? :embedding))

(define-premium-feature enable-embedding-sdk-origins?
  "Should we allow users embed the SDK in sites other than localhost?"
  :embedding-sdk)

(define-premium-feature enable-whitelabeling?
  "Should we allow full whitelabel embedding (reskinning the entire interface?)"
  :whitelabel
  :export? true)

(define-premium-feature enable-audit-app?
  "Should we enable the Audit Logs interface in the Admin UI?"
  :audit-app)

(define-premium-feature ^{:added "0.41.0"} enable-email-allow-list?
  "Should we enable restrict email domains for subscription recipients?"
  :email-allow-list)

(define-premium-feature ^{:added "0.41.0"} enable-cache-granular-controls?
  "Should we enable granular controls for cache TTL at the database, dashboard, and card level?"
  :cache-granular-controls)

(define-premium-feature ^{:added "1.53.0"} enable-preemptive-caching?
  "Should we enable preemptive caching; i.e., auto-refresh of cached results?"
  :cache-preemptive)

(define-premium-feature ^{:added "0.41.0"} enable-config-text-file?
  "Should we enable initialization on launch from a config file?"
  :config-text-file)

(define-premium-feature enable-sandboxes?
  "Should we enable data sandboxes (row-level permissions)?"
  :sandboxes
  :export? true)

(define-premium-feature enable-sso-jwt?
  "Should we enable JWT-based authentication?"
  :sso-jwt)

(define-premium-feature enable-sso-saml?
  "Should we enable SAML-based authentication?"
  :sso-saml)

(define-premium-feature enable-sso-ldap?
  "Should we enable advanced configuration for LDAP authentication?"
  :sso-ldap)

(define-premium-feature enable-sso-google?
  "Should we enable advanced configuration for Google Sign-In authentication?"
  :sso-google)

(define-premium-feature enable-scim?
  "Should we enable user/group provisioning via SCIM?"
  :scim)

(defn enable-any-sso?
  "Should we enable any SSO-based authentication?"
  []
  (or (enable-sso-jwt?)
      (enable-sso-saml?)
      (enable-sso-ldap?)
      (enable-sso-google?)))

(define-premium-feature enable-session-timeout-config?
  "Should we enable configuring session timeouts?"
  :session-timeout-config)

(define-premium-feature can-disable-password-login?
  "Can we disable login by password?"
  :disable-password-login)

(define-premium-feature ^{:added "0.41.0"} enable-dashboard-subscription-filters?
  "Should we enable filters for dashboard subscriptions?"
  :dashboard-subscription-filters)

(define-premium-feature ^{:added "0.41.0"} enable-advanced-permissions?
  "Should we enable extra knobs around permissions (block access, connection impersonation, etc.)?"
  :advanced-permissions)

(define-premium-feature ^{:added "0.41.0"} enable-content-verification?
  "Should we enable verified content, like verified questions and models (and more in the future, like actions)?"
  :content-verification)

(define-premium-feature ^{:added "0.41.0"} enable-official-collections?
  "Should we enable Official Collections?"
  :official-collections)

(define-premium-feature ^{:added "0.41.0"} enable-snippet-collections?
  "Should we enable SQL snippet folders?"
  :snippet-collections)

(define-premium-feature ^{:added "0.45.0"} enable-serialization?
  "Enable the v2 SerDes functionality"
  :serialization)

(define-premium-feature ^{:added "0.47.0"} enable-email-restrict-recipients?
  "Enable restrict email recipients?"
  :email-restrict-recipients)

(define-premium-feature ^{:added "0.50.0"} enable-llm-autodescription?
  "Enable automatic descriptions of questions and dashboards by LLMs?"
  :llm-autodescription)

(define-premium-feature ^{:added "0.51.0"} enable-query-reference-validation?
  "Enable the Query Validator Tool?"
  :query-reference-validation)

(define-premium-feature enable-upload-management?
  "Should we allow admins to clean up tables created from uploads?"
  :upload-management)

(define-premium-feature table-data-editing?
  "Should we allow users to edit the data within tables?"
  :table-data-editing)

(define-premium-feature has-attached-dwh?
  "Does the Metabase Cloud instance have an internal data warehouse attached?"
  :attached-dwh)

(define-premium-feature ^{:added "0.51.0"} enable-collection-cleanup?
  "Should we enable Collection Cleanup?"
  :collection-cleanup)

(define-premium-feature ^{:added "0.51.0"} enable-database-auth-providers?
  "Should we enable database auth-providers?"
  :database-auth-providers)

(define-premium-feature ^{:added "0.54.0"} enable-database-routing?
  "Should we enable database routing?"
  :database-routing)

(define-premium-feature ^{:added "0.55.0"} development-mode?
  "Is this a development instance that should have watermarks?"
  :development-mode)

(define-premium-feature ^{:added "0.52.0"} enable-metabot-v3?
  "Enable the newest LLM-based MetaBot? (The one that lives in [[metabase-enterprise.metabot-v3.core]].)"
  :metabot-v3)

(define-premium-feature ^{:added "0.54.0"} enable-ai-sql-fixer?
  "Should Metabase suggest SQL fixes?"
  :ai-sql-fixer)

(define-premium-feature ^{:added "0.54.0"} enable-ai-sql-generation?
  "Should Metabase generate SQL queries?"
  :ai-sql-generation)

(defn- -token-features []
  {:advanced_permissions           (enable-advanced-permissions?)
   :ai_sql_fixer                   (enable-ai-sql-fixer?)
   :ai_sql_generation              (enable-ai-sql-generation?)
   :attached_dwh                   (has-attached-dwh?)
   :audit_app                      (enable-audit-app?)
   :cache_granular_controls        (enable-cache-granular-controls?)
   :cache_preemptive               (enable-preemptive-caching?)
   :collection_cleanup             (enable-collection-cleanup?)
   :config_text_file               (enable-config-text-file?)
   :content_verification           (enable-content-verification?)
   :dashboard_subscription_filters (enable-dashboard-subscription-filters?)
   :database_auth_providers        (enable-database-auth-providers?)
   :database_routing               (enable-database-routing?)
   :development-mode               (development-mode?)
   :disable_password_login         (can-disable-password-login?)
   :email_allow_list               (enable-email-allow-list?)
   :email_restrict_recipients      (enable-email-restrict-recipients?)
   :embedding                      (hide-embed-branding?)
   :embedding_sdk                  (enable-embedding-sdk-origins?)
   :hosting                        (is-hosted?)
   :llm_autodescription            (enable-llm-autodescription?)
   :metabot_v3                     (enable-metabot-v3?)
   :official_collections           (enable-official-collections?)
   :query_reference_validation     (enable-query-reference-validation?)
   :sandboxes                      (enable-sandboxes?)
   :scim                           (enable-scim?)
   :serialization                  (enable-serialization?)
   :session_timeout_config         (enable-session-timeout-config?)
   :snippet_collections            (enable-snippet-collections?)
   :sso_google                     (enable-sso-google?)
   :sso_jwt                        (enable-sso-jwt?)
   :sso_ldap                       (enable-sso-ldap?)
   :sso_saml                       (enable-sso-saml?)
   :upload_management              (enable-upload-management?)
   :whitelabel                     (enable-whitelabeling?)})

(defsetting token-features
  "Features registered for this instance's token"
  :visibility :public
  :setter     :none
  :getter     -token-features
  :doc        false)
