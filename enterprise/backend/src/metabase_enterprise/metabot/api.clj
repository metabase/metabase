(ns metabase-enterprise.metabot.api
  "Enterprise-only Metabot API routes."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]))

(def ^:private metabot-usage-response-schema
  [:map
   [:quotas [:maybe [:sequential :map]]]])

(api.macros/defendpoint :get "/usage"
  :- metabot-usage-response-schema
  "Fetch current Harbormaster quota usage for the Metabase token."
  [_route-params
   _query-params]
  (perms/check-has-application-permission :setting)
  {:quotas (premium-features/quotas)})
