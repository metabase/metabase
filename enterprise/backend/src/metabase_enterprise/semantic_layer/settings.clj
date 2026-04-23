(ns metabase-enterprise.semantic-layer.settings
  "Settings for the semantic-layer module.
  Kept out of the scoring namespace so analysis code stays free of settings reads."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-complexity-scoring-enabled
  (deferred-tru "Run the scheduled Data Complexity Score job (one node per cluster, daily).")
  :encryption :no
  :visibility :admin
  :default    true
  :type       :boolean
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-last-fingerprint
  (deferred-tru "Fingerprint of the last successful score emission. Internal bookkeeping — the task reads this on boot to decide whether to fire immediately.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-claim
  (deferred-tru "Internal bookkeeping: edn-encoded claim marking an in-progress scoring run (shared by the boot-time hook and the daily cron) so other nodes/paths skip duplicate work. Cleared after the run; a TTL on the claim timestamp lets the next boot or cron retry if the claimant crashed.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)
