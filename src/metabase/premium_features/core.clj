(ns metabase.premium-features.core
  "API namespace for the Metabase premium features code. This is a collection of functionality that lives in the OSS
  code, but is supports the enforcement of Enterprise Edition features, including the token check logic and the
  defenterprise macro."
  (:require
   [metabase.premium-features.defenterprise]
   [metabase.premium-features.settings]
   [metabase.premium-features.token-check]
   [potemkin :as p]))

(comment metabase.premium-features.defenterprise/keep-me
         metabase.premium-features.settings/keep-me
         metabase.premium-features.token-check/keep-me)

(p/import-vars
 [metabase.premium-features.defenterprise
  defenterprise
  defenterprise-schema]

 [metabase.premium-features.token-check
   ;; TODO: move airgap code to a dedicated namespace?
  airgap-check-user-count
  assert-has-feature
  assert-has-any-features
  ee-feature-error
  has-any-features?
  has-feature?
  log-enabled?
  max-users-allowed
  plan-alias
  TokenStatus]

 (metabase.premium-features.settings
  active-users-count
  airgap-enabled
  can-disable-password-login?
  define-premium-feature
  development-mode?
  enable-advanced-permissions?
  enable-ai-sql-fixer?
  enable-ai-sql-generation?
  enable-any-sso?
  enable-audit-app?
  enable-cache-granular-controls?
  enable-collection-cleanup?
  enable-config-text-file?
  enable-content-verification?
  enable-dashboard-subscription-filters?
  enable-database-auth-providers?
  enable-database-routing?
  enable-email-allow-list?
  enable-email-restrict-recipients?
  enable-embedding-sdk-origins?
  enable-llm-autodescription?
  enable-metabot-v3?
  enable-official-collections?
  enable-preemptive-caching?
  enable-query-reference-validation?
  enable-sandboxes?
  enable-scim?
  enable-serialization?
  enable-session-timeout-config?
  enable-snippet-collections?
  enable-sso-google?
  enable-sso-jwt?
  enable-sso-ldap?
  enable-sso-saml?
  enable-upload-management?
  enable-whitelabeling?
  has-attached-dwh?
  hide-embed-branding?
  is-hosted?
  premium-embedding-token
  site-uuid-for-premium-features-token-checks
  table-data-editing?
  token-features
  token-status))
