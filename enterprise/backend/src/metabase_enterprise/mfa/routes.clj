(ns metabase-enterprise.mfa.routes
  "Ring handler for /api/ee/mfa. Mounted with neither auth (the verify caller has no session yet)
  nor a premium-feature gate (enforcement must survive license lapse — the feature check guards
  setup paths, not verification)."
  (:require
   [metabase-enterprise.mfa.api]
   [metabase.api.macros :as api.macros]))

(comment metabase-enterprise.mfa.api/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "/api/ee/mfa routes"
  (api.macros/ns-handler 'metabase-enterprise.mfa.api))
