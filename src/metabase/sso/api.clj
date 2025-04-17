(ns metabase.sso.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sso.api.google]
   [metabase.sso.api.ldap]))

(comment metabase.sso.api.google/keep-me
         metabase.sso.api.ldap/keep-me)

(def ^{:arglists '([request respond raise])} google-auth-routes
  "`/api/google/` routes."
  (api.macros/ns-handler 'metabase.sso.api.google))

(def ^{:arglists '([request respond raise])} ldap-routes
  "`/api/ldap` routes."
  (api.macros/ns-handler 'metabase.sso.api.ldap))
