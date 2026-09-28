(ns metabase.sso.core
  (:require
   [metabase.sso.common]
   [metabase.sso.google]
   [metabase.sso.ldap]
   [metabase.sso.ldap.default-implementation]
   [metabase.sso.ldap.settings]
   [metabase.sso.oidc.check]
   [metabase.sso.oidc.state]
   [metabase.sso.settings]
   [potemkin :as p]))

(p/import-vars
 [metabase.sso.common
  sync-group-memberships!]
 [metabase.sso.ldap
  find-user
  verify-password]
 [metabase.sso.ldap.default-implementation
  LDAPSettings
  ldap-search-result->user-info]
 [metabase.sso.oidc.check
  check-oidc-configuration]
 [metabase.sso.oidc.state
  wrap-oidc-redirect
  clear-oidc-state-cookie]
 [metabase.sso.settings
  google-auth-client-id
  google-auth-enabled
  send-new-sso-user-admin-email?
  sso-enabled?
  sso-source-enabled?]
 [metabase.sso.ldap.settings
  ldap-enabled])

(p/import-def metabase.sso.ldap.default-implementation/UserInfo LDAPUserInfo)

(p/import-def metabase.sso.ldap.default-implementation/search ldap-search)
