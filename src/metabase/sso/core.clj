(ns metabase.sso.core
  (:require
   [metabase.sso.login]
   [metabase.sso.settings]
   [potemkin :as p]))

(comment
  metabase.sso.login/keep-me
  metabase.sso.settings/keep-me)

(p/import-vars
 [metabase.sso.login
  ldap-login]
 [metabase.sso.settings
  humanize-ldap-error-messages
  ldap-enabled
  ldap-enabled!])
