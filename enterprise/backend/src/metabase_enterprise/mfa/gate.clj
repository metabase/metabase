(ns metabase-enterprise.mfa.gate
  "Login-flow gate for native multi-factor authentication.

  Uses `:feature :none` deliberately: enforcement must not depend on the current token, so a lapsed
  license never silently stops challenging enrolled users (the token gates setup — enabling the
  setting, new enrollments — not enforcement). The gate is inert until the `mfa-enabled` setting is
  on, and that setting can only be turned on with the `:multi-factor-auth` feature present."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise apply-mfa-gate
  "Decide whether a successful first-factor login must complete a second factor before a session is
  created. Pass-through until the TOTP challenge logic lands."
  :feature :none
  [_provider login-result]
  login-result)
