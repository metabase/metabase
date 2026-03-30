(ns metabase-enterprise.metabot.api
  "Enterprise-only Metabot API routes."
  (:require
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]))

(def ^:private metabot-usage-response-schema
  [:map
   [:tokens [:maybe int?]]
   [:updated-at [:maybe :string]]])

(defn- metabot-query-quota [quotas]
  (m/find-first (fn [{:keys [hosting-feature quota-type]}]
                  (and (= hosting-feature "metabase-ai")
                       (= quota-type "queries")))
                quotas))

(api.macros/defendpoint :get "/usage"
  :- metabot-usage-response-schema
  "Fetch current Metabot token usage for the current billing period."
  [_route-params
   _query-params]
  (perms/check-has-application-permission :setting)
  (let [token-status (premium-features/token-status)
        query-quota  (metabot-query-quota (:quotas token-status))]
    (log/warn token-status)
    {:tokens     (some-> token-status :meters :metabot-tokens :meter-value)
     :updated-at (or (some-> token-status :meters :metabot-tokens :meter-updated-at)
                     (:updated-at query-quota))}))
