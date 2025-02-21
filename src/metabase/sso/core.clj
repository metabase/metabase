(ns metabase.sso.core
  (:require
   [metabase.sso.common]
   [metabase.sso.google]
   [metabase.sso.ldap]
   [metabase.sso.ldap.default-implementation]
   [metabase.sso.settings]
   [potemkin :as p]))

(p/import-vars
 [metabase.sso.common
  sync-group-memberships!]
 [metabase.sso.google
  do-google-auth
  google-auth-create-new-user!]
 [metabase.sso.ldap.default-implementation
  LDAPSettings
  ldap-groups->mb-group-ids
  ldap-search-result->user-info]
 [metabase.sso.settings
  google-auth-client-id
  google-auth-enabled
  ldap-enabled
  send-new-sso-user-admin-email?])

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap/find-user find-ldap-user)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap/verify-password verify-ldap-password)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap/fetch-or-create-user! fetch-or-create-ldap-user!)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap.default-implementation/UserInfo LDAPUserInfo)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap.default-implementation/all-mapped-group-ids all-mapped-ldap-group-ids)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.sso.ldap.default-implementation/search ldap-search)
