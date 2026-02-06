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
  assert-valid-airgap-user-count!
  assert-airgap-allows-user-creation!
  assert-has-feature
  assert-has-any-features
  ee-feature-error
  has-any-features?
  has-feature?
  log-enabled?
  max-users-allowed
  plan-alias
  quotas
  TokenStatus
  clear-cache!
  clear-local-cache!]

 (metabase.premium-features.settings
  active-users-count
  airgap-enabled
  can-disable-password-login?
  define-premium-feature
  development-mode?
  enable-tenants?
  enable-advanced-permissions?
  enable-ai-entity-analysis?
  enable-ai-sql-fixer?
  enable-ai-sql-generation?
  enable-any-sso?
  enable-audit-app?
  enable-cache-granular-controls?
  enable-collection-cleanup?
  enable-config-text-file?
  enable-content-translation?
  enable-content-verification?
  enable-dashboard-subscription-filters?
  enable-database-auth-providers?
  enable-database-routing?
  enable-library?
  enable-dependencies?
  enable-email-allow-list?
  enable-email-restrict-recipients?
  enable-embedding-sdk-origins?
  enable-embedding-simple-feature?
  enable-llm-autodescription?
  enable-metabot-v3?
  enable-official-collections?
  enable-preemptive-caching?
  enable-query-reference-validation?
  enable-remote-sync?
  enable-sandboxes?
  enable-scim?
  enable-semantic-search?
  enable-serialization?
  enable-session-timeout-config?
  enable-snippet-collections?
  enable-sso-google?
  enable-sso-jwt?
  enable-sso-ldap?
  enable-sso-saml?
  enable-support-users?
  enable-sso-slack?
  enable-transforms?
  enable-python-transforms?
  enable-upload-management?
  enable-whitelabeling?
  enable-workspaces?
  has-attached-dwh?
  hide-embed-branding?
  is-hosted?
  premium-embedding-token
  site-uuid-for-premium-features-token-checks
  table-data-editing?
  token-features
  token-status))
