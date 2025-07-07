(ns metabase.sso.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sso.api.google]
   [metabase.sso.api.ldap]
   [metabase.sso.api.oauth2]))

(comment metabase.sso.api.google/keep-me
         metabase.sso.api.ldap/keep-me
         metabase.sso.api.oauth2/keep-me)

(def ^{:arglists '([request respond raise])} google-auth-routes
  "`/api/google/` routes."
  (api.macros/ns-handler 'metabase.sso.api.google))

(def ^{:arglists '([request respond raise])} ldap-routes
  "`/api/ldap` routes."
  (api.macros/ns-handler 'metabase.sso.api.ldap))

(def ^{:arglists '([request respond raise])} sso-routes
  "`/auth/sso/` routes for pluggable SSO."
  (api.macros/ns-handler 'metabase.sso.api.oauth2))
