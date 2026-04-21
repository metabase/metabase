(ns metabase.audit-app.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(defsetting last-analytics-checksum
  "A place to save the analytics-checksum, to check between app startups. If set to -1, skips the checksum process
  entirely to avoid calculating checksums in environments (e2e tests) where we don't care."
  :type       :integer
  :visibility :internal
  :audit      :never
  :doc        false
  :export?    false)

(def min-retention-days
  "Minimum allowed value for `audit-max-retention-days`."
  30)

(def default-retention-days
  "Default value for `audit-max-retention-days`."
  720)

(defn log-minimum-value-warning
  "Logs a warning that the value for `audit-max-retention-days` is below the allowed minimum and will be overridden."
  [env-var-value]
  (log/warnf "MB_AUDIT_MAX_RETENTION_DAYS is set to %d; using the minimum value of %d instead."
             env-var-value
             min-retention-days))

(defn- -audit-max-retention-days []
  (let [env-var-value (setting/get-value-of-type :integer :audit-max-retention-days)]
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

(defsetting audit-max-retention-days
  (deferred-tru "Number of days to retain data in audit-related tables. Minimum value is 30; set to 0 to retain data indefinitely.")
  :visibility :internal
  :setter     :none
  :audit      :never
  :getter     #'-audit-max-retention-days
  :doc "Sets the maximum number of days Metabase preserves rows for the following application database tables:

- `query_execution`
- `audit_log`
- `view_log`

Twice a day, Metabase will delete rows older than this threshold. The minimum value is 30 days (Metabase will treat entered values of 1 to 29 the same as 30).
If set to 0, Metabase will keep all rows.")

(defsetting audit-table-truncation-batch-size
  (deferred-tru "Batch size to use for deletion of old rows for audit-related tables (like query_execution). Can be only set as an environment variable.")
  :visibility :internal
  :setter     :none
  :type       :integer
  :default    50000
  :audit      :never
  :export?    false)

(defsetting analytics-dev-mode
  (str "Setting this environment variable to true will  make the Usage analytics collection editable for"
       "local development.")
  :type       :boolean
  :default    false
  :visibility :internal
  :audit      :never
  :export?    false
  :doc        false)
