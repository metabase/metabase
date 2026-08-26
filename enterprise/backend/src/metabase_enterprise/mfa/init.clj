(ns metabase-enterprise.mfa.init
  "Loads MFA namespaces that must be present at launch for side effects."
  (:require
   ;; core loads gate transitively
   [metabase-enterprise.mfa.core]
   [metabase-enterprise.mfa.settings]
   ;; verification carries the (derive :provider/totp ...) that AuthIdentity validation needs;
   ;; require it explicitly: core requires verification, but an explicit require is more
   ;; robust and clearly documents the side-effect dependency
   [metabase-enterprise.mfa.verification]))
