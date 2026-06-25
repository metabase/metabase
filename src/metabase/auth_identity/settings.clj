(ns metabase.auth-identity.settings
  "Settings controlling native multi-factor authentication (TOTP)."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting mfa-enabled
  (deferred-tru "Allow users to secure their account with two-factor authentication (an authenticator app).")
  :visibility :public
  :type       :boolean
  :default    false
  :export?    false
  :audit      :raw-value)

(defsetting mfa-required
  (deferred-tru "Require everyone who signs in with email/password or LDAP to set up two-factor authentication.")
  :visibility :admin
  :type       :boolean
  :default    false
  :export?    false
  :audit      :raw-value)
