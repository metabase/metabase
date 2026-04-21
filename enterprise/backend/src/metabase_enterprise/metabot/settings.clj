(ns metabase-enterprise.metabot.settings
  "Enterprise-only metabot settings for usage limits and managed provider validation."
  (:require
   [clojure.string :as str]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def ^:private valid-limit-units #{:tokens :messages})

(defsetting metabot-limit-unit
  (deferred-tru "The unit used for metabot usage limits.")
  :type       :keyword
  :default    :tokens
  :visibility :settings-manager
  :encryption :no
  :export?    true
  :doc        false
  :setter     (fn [new-value]
                (let [v (some-> new-value keyword)]
                  (when (and v (not (contains? valid-limit-units v)))
                    (throw (ex-info (str "Invalid limit unit: " (pr-str new-value)
                                         ". Must be one of: tokens, messages.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :keyword :metabot-limit-unit v))))

(def ^:private valid-reset-rates #{:daily :weekly :monthly})

(defsetting metabot-limit-reset-rate
  (deferred-tru "How often metabot usage limits reset.")
  :type       :keyword
  :default    :monthly
  :visibility :settings-manager
  :encryption :no
  :export?    true
  :doc        false
  :setter     (fn [new-value]
                (let [v (some-> new-value keyword)]
                  (when (and v (not (contains? valid-reset-rates v)))
                    (throw (ex-info (str "Invalid reset rate: " (pr-str new-value)
                                         ". Must be one of: daily, weekly, monthly.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :keyword :metabot-limit-reset-rate v))))

(defsetting metabot-quota-reached-message
  (deferred-tru "The message shown to users when they reach their usage quota.")
  :type       :string
  :default    "You have reached your AI usage limit for the current period. Please contact your administrator."
  :visibility :settings-manager
  :encryption :no
  :export?    true
  :doc        false)

;;; ----------------------------------------- Managed Provider Validation -----------------------------------------

(def ^:private proxied-providers-and-models
  "Providers and models that can be used via the metabase managed AI proxy.

  The keys of this map must be a subset of the direct providers."
  {"anthropic" #{"claude-sonnet-4-6"}})

(defn- validate-metabase-managed-provider!
  "Validate that `value` is a `metabase/provider/model` string whose inner provider and
  model are in the [[proxied-providers-and-models]] allow-list. Throws on invalid input."
  [value]
  (when-not (provider-util/metabase-provider? value)
    (throw (ex-info (tru "Invalid metabase managed AI provider {0}. Must start with {1}/."
                         (pr-str value) provider-util/metabase-provider-prefix)
                    {:status-code 400
                     :value       value})))
  (let [inner-provider    (provider-util/provider-and-model->provider value)
        inner-model       (provider-util/provider-and-model->model value)
        allowed-providers (sort (keys proxied-providers-and-models))
        allowed-models    (get proxied-providers-and-models inner-provider)]
    (when-not (contains? proxied-providers-and-models inner-provider)
      (throw (ex-info (tru "Unsupported provider {0} for metabase managed AI. Supported providers: {1}"
                           (pr-str inner-provider)
                           (str/join ", " allowed-providers))
                      {:status-code 400
                       :provider    inner-provider
                       :supported   (set (keys proxied-providers-and-models))})))
    (when (str/blank? inner-model)
      (throw (ex-info (tru "Model name is required. Expected format: metabase/provider/model, e.g. {0}"
                           (pr-str metabot.settings/default-metabase-llm-metabot-provider))
                      {:status-code 400
                       :value       value})))
    (when-not (contains? allowed-models inner-model)
      (throw (ex-info (tru "Unsupported model {0} for metabase managed provider {1}. Supported models: {2}"
                           (pr-str inner-model)
                           (pr-str inner-provider)
                           (str/join ", " (sort allowed-models)))
                      {:status-code 400
                       :provider    inner-provider
                       :model       inner-model
                       :supported   allowed-models})))))

(defenterprise validate-metabot-provider!
  "EE implementation: validates both direct and metabase-managed providers when the
  `:metabase-ai-managed` or `:metabot-v3` feature is present."
  :feature :none
  [value]
  (metabot.settings/validate-llm-provider-type! value)
  (if (and (provider-util/metabase-provider? value)
           (or (premium-features/has-feature? :metabase-ai-managed)
               (premium-features/has-feature? :metabot-v3)))
    (validate-metabase-managed-provider! value)
    (metabot.settings/validate-direct-provider! value)))
