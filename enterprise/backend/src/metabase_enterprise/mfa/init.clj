(ns metabase-enterprise.mfa.init
  "Loads MFA namespaces that must be present at launch for side effects."
  (:require
   ;; enrollment carries the (derive :provider/totp ...) that AuthIdentity validation needs;
   ;; require it explicitly rather than relying on gate's transitive require
   [metabase-enterprise.mfa.enrollment]
   [metabase-enterprise.mfa.gate]
   [metabase-enterprise.mfa.settings]))
