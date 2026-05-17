(ns metabase-enterprise.metabot.settings
  "Enterprise-only metabot settings for usage limits."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

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

(defsetting metabot-advanced-permissions
  (deferred-tru "Whether AI feature access uses advanced group-level permissions.")
  :type       :boolean
  :default    false
  :visibility :admin
  :encryption :no
  :export?    true
  :doc        false)

(def ^:private min-retention-days
  "Minimum allowed value for `ai-usage-max-retention-days`."
  30)

(def ^:private default-retention-days
  "Default value for `ai-usage-max-retention-days` (~6 months)."
  180)

(defn- log-minimum-value-warning
  [env-var-value]
  (log/warnf "MB_AI_USAGE_MAX_RETENTION_DAYS is set to %d; using the minimum value of %d instead."
             env-var-value
             min-retention-days))

(defn- -ai-usage-max-retention-days []
  (let [env-var-value (setting/get-value-of-type :integer :ai-usage-max-retention-days)]
    (cond
      (nil? env-var-value)
      default-retention-days

      ;; Treat 0 as an alias for infinity
      (zero? env-var-value)
      ##Inf

      (< env-var-value min-retention-days)
      (do
        (log-minimum-value-warning env-var-value)
        min-retention-days)

      :else
      env-var-value)))

(defsetting ai-usage-max-retention-days
  (deferred-tru "Number of days to retain rows in the ai_usage_log table. Minimum value is 30; set to 0 to retain data indefinitely.")
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :getter     #'-ai-usage-max-retention-days
  :doc "Sets the maximum number of days Metabase preserves rows in the `ai_usage_log` table.

Once a day, Metabase deletes rows older than this threshold. The minimum value is 30 days (Metabase will treat entered values of 1 to 29 the same as 30).
If set to 0, Metabase will keep all rows.")
