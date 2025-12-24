(ns metabase-enterprise.auth-identity.provider
  "Enterprise extensions for the auth-identity provider system.
   Adds support for login_attributes and jwt_attributes fields on User model."
  (:require
   [metabase.premium-features.core :refer [defenterprise] :as premium-features]))

(defenterprise sso-user-fields
  "Return the list of User model fields that should be populated from SSO user data.
   Enterprise version includes login_attributes and jwt_attributes for storing SSO-specific attributes.

  This uses feature none because we want the same behavior for multiple sso feature flags"
  :feature :none
  []
  (cond-> [:email :first_name :last_name :sso_source]
    (some premium-features/has-feature? [:sso-ldap :sso-jwt :sso-saml])
    (conj :login_attributes)
    (premium-features/has-feature? :tenants)
    (conj :tenant_id)
    (premium-features/has-feature? :sso-jwt)
    (conj :jwt_attributes)))
