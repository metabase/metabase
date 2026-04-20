(ns metabase-enterprise.metabot.api
  "Enterprise-only Metabot API routes."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]))

(def ^:private metabot-usage-response-schema
  [:map
   [:is-locked [:maybe boolean?]]
   [:tokens [:maybe int?]]
   [:updated-at [:maybe :string]]])

(defn- meter-value
  [meters meter-key]
  (some-> meter-key keyword meters))

(defn- default-metabase-meter-key
  []
  (some-> metabot.settings/default-metabase-llm-metabot-provider
          provider-util/strip-metabase-prefix
          u/qualified-name
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
    {:is-locked   (:is-locked meter)
     :tokens      (:meter-value meter)
     :free-tokens (:meter-free-units meter)
     :updated-at  (:meter-updated-at meter)}))
