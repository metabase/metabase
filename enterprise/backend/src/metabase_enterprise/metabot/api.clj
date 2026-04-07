(ns metabase-enterprise.metabot.api
  "Enterprise-only Metabot API routes."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]))

(def ^:private metabot-usage-response-schema
  [:map
   [:tokens [:maybe int?]]
   [:updated-at [:maybe :string]]])

(api.macros/defendpoint :get "/usage"
  :- metabot-usage-response-schema
  "Fetch current Metabot token usage for the current billing period."
  [_route-params
   _query-params]
  (perms/check-has-application-permission :setting)
  (let [token-status (premium-features/token-status)]
    {:tokens     (some-> token-status :meters :metabot-tokens :meter-value)
     :updated-at (some-> token-status :meters :metabot-tokens :meter-updated-at)}))
