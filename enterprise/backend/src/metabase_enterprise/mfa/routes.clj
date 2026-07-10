(ns metabase-enterprise.mfa.routes
  "Ring handler for /api/ee/mfa. Mounted without a premium-feature gate: managing an existing
  enrollment (disable/status/recover) must survive license lapse — the feature check guards setup
  paths. All routes here require a session; MFA verification lives under /api/session/mfa/* and is
  mounted there without an auth requirement (the caller is mid-login)."
  (:require
   [metabase-enterprise.mfa.management]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.mfa.management/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "/api/ee/mfa routes"
  (+auth (api.macros/ns-handler 'metabase-enterprise.mfa.management)))
