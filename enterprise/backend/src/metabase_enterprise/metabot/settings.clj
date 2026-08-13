(ns metabase-enterprise.metabot.settings
  "Enterprise-only metabot settings for usage limits."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def ^:private valid-limit-units #{:tokens :messages})

(defsetting metabot-limit-unit
  (deferred-tru "The unit used for Metabot usage limits: `tokens` or `messages`.")
  :type       :keyword
  :default    :tokens
  :visibility :settings-manager
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :setter     (fn [new-value]
                (let [v (some-> new-value keyword)]
                  (when (and v (not (contains? valid-limit-units v)))
                    (throw (ex-info (str "Invalid limit unit: " (pr-str new-value)
                                         ". Must be one of: tokens, messages.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :keyword :metabot-limit-unit v))))

(def ^:private valid-reset-rates #{:daily :weekly :monthly})

(defsetting metabot-limit-reset-rate
  (deferred-tru "How often Metabot usage limits reset: `daily`, `weekly`, or `monthly`.")
  :type       :keyword
  :default    :monthly
  :visibility :settings-manager
  :encryption :no
  :export?    true
  :feature    :ai-controls
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
  :feature    :ai-controls)

(defsetting metabot-advanced-permissions
  (deferred-tru "Whether the AI feature access admin page shows granular, per-tool group permissions instead of a single on/off toggle per group.")
  :type       :boolean
  :default    false
  :visibility :admin
  :encryption :no
  :export?    true
  :feature    :ai-controls)
