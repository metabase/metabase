(ns metabase-enterprise.metabot.api
  "Enterprise-only Metabot API routes."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]))

(def ^:private metabot-usage-response-schema
  [:map
   [:tokens [:maybe int?]]
   [:updated-at [:maybe :string]]])

(defn- meter-value
  [meters meter-key]
  (or (some-> meter-key keyword meters)
      (some-> meter-key meters)))

(defn- default-metabase-meter-key
  []
  (some-> metabot.settings/default-metabase-llm-metabot-provider
          provider-util/strip-metabase-prefix
          (str/replace-first "/" ":")
          (str ":tokens")))

(defn- meter-entry
  [token-status]
  (let [meters      (:meters token-status)
        default-key (default-metabase-meter-key)]
    (meter-value meters default-key)))

(api.macros/defendpoint :get "/usage"
  :- metabot-usage-response-schema
  "Fetch current Metabot token usage for the current billing period."
  [_route-params
   _query-params]
  (perms/check-has-application-permission :setting)
  (let [meter (some-> (premium-features/token-status)
                      meter-entry)]
    {:tokens     (:meter-value meter)
     :updated-at (:meter-updated-at meter)}))
