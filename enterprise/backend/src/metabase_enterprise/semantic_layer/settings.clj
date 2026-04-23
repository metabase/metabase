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
  :default    false
  :type       :boolean
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-last-fingerprint
  (deferred-tru "Internal bookkeeping: Fingerprint of the last successful calculation. Used to prevent needless re-calculations.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-claim
  (deferred-tru "Internal bookkeeping: EDN metadata for in-progress run so other nodes/paths skip duplicate work, with TTL.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)
