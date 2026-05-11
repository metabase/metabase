(ns metabase-enterprise.metabot.settings
  "Enterprise-only metabot settings for usage limits."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

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
