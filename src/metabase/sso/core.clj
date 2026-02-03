(ns metabase.sso.core
  (:require
   [metabase.sso.common]
   [metabase.sso.google]
   [metabase.sso.ldap]
   [metabase.sso.ldap.default-implementation]
   [metabase.sso.oidc.state]
   [metabase.sso.settings]
   [potemkin :as p]))

(p/import-vars
 [metabase.sso.common
  sync-group-memberships!]
 [metabase.sso.ldap.default-implementation
  LDAPSettings
  ldap-search-result->user-info]
 [metabase.sso.oidc.state
  wrap-oidc-redirect
  clear-oidc-state-cookie]
 [metabase.sso.settings
  google-auth-client-id
  google-auth-enabled
  ldap-enabled
  send-new-sso-user-admin-email?
  sso-enabled?])

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap.default-implementation/UserInfo LDAPUserInfo)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap.default-implementation/search ldap-search)
