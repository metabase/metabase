(ns metabase-enterprise.mfa.routes
  "Ring handler for /api/ee/mfa. Mounted without a premium-feature gate: enforcement and managing
  an existing enrollment must survive license lapse — the feature check guards setup paths.
  `/verify` is reachable with no session (the caller is mid-login); everything else requires one."
  (:require
   [metabase-enterprise.mfa.api]
   [metabase-enterprise.mfa.management]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.mfa.api/keep-me
         metabase-enterprise.mfa.management/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "/api/ee/mfa routes"
  (handlers/routes
   (api.macros/ns-handler 'metabase-enterprise.mfa.api)
   (+auth (api.macros/ns-handler 'metabase-enterprise.mfa.management))))
