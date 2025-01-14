(ns metabase.premium-features.core
  "API namespace for the Metabase premium features code. This is a collection of functionality that lives in the OSS
  code, but is supports the enforcement of Enterprise Edition features, including the token check logic and the
  defenterprise macro."
  (:require
   [metabase.config :as config]
   [metabase.models.setting :refer [defsetting]]
   [metabase.premium-features.defenterprise]
   [metabase.premium-features.token-check]
   [potemkin :as p]))

(p/import-vars
 [metabase.premium-features.defenterprise
  defenterprise
  defenterprise-schema]

 [metabase.premium-features.token-check
  active-users-count
  ;; TODO: move airgap code to a dedicated namespace?
  airgap-check-user-count
  airgap-enabled
  assert-has-feature
  assert-has-any-features
  ee-feature-error
  is-hosted?
  has-any-features?
  has-feature?
  log-enabled?
  max-users-allowed
  plan-alias
  premium-embedding-token
  token-status
  TokenStatus])

(def premium-features
  "Set of defined premium feature keywords."
  (atom #{}))

(defn- default-premium-feature-getter [feature]
  (fn []
    (and config/ee-available?
         (has-feature? feature))))

(defmacro define-premium-feature
  "Convenience for generating a [[metabase.models.setting/defsetting]] form for a premium token feature. (The Settings
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
  "Should we enable extra knobs around permissions (block access, and in the future, moderator roles, feature-level
  permissions, etc.)?"
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

(define-premium-feature has-attached-dwh?
  "Does the Metabase Cloud instance have an internal data warehouse attached?"
  :attached-dwh)

;; `enhancements` are not currently a specific "feature" that EE tokens can have or not have. Instead, it's a
;; catch-all term for various bits of EE functionality that we assume all EE licenses include. (This may change in the
;; future.)
;;
;; By checking whether `(*token-features*)` is non-empty we can see whether we have a valid EE token. If the token is
;; valid, we can enable EE enhancements.
;;
;; DEPRECATED -- it should now be possible to use the new 0.41.0+ features for everything previously covered by
;; 'enhancements'.
(define-premium-feature ^:deprecated enable-enhancements?
  "Should we various other enhancements, e.g. NativeQuerySnippet collection permissions?"
  :enhancements
  :getter #(and config/ee-available? (has-any-features?)))

(define-premium-feature ^{:added "0.51.0"} enable-collection-cleanup?
  "Should we enable Collection Cleanup?"
  :collection-cleanup)

(define-premium-feature ^{:added "0.51.0"} enable-database-auth-providers?
  "Should we enable database auth-providers?"
  :database-auth-providers)
