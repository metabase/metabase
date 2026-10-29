(ns metabase-enterprise.embedding-hub.api
  "Enterprise half of the setup guide checklist. The endpoint itself lives in [[metabase.embedding-hub.api]]; what stays
  here is the one check a community build cannot make, because the JWT and SAML settings ship only with enterprise
  code."
  (:require
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]))

(defenterprise has-configured-sso?
  "Whether JWT or SAML is licensed, enabled and configured."
  ;; :none rather than a feature, because the token checks below already gate this -- an instance
  ;; can license SSO without modular embedding
  :feature :none
  []
  (or (and (premium-features/has-feature? :sso-jwt) (sso-settings/jwt-enabled-and-configured))
      (and (premium-features/has-feature? :sso-saml) (sso-settings/saml-enabled) (sso-settings/saml-configured))))
