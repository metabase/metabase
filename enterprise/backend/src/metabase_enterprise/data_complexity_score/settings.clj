(ns metabase-enterprise.data-complexity-score.settings
  "Settings for the data-complexity-score module. Currently just one knob: the detail level the complexity
  score is computed at."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting data-complexity-scoring-enabled
  (deferred-tru "Run the scheduled Data Complexity Score job (one node per cluster, daily).")
  :encryption :no
  :visibility :admin
  :default    false
  :type       :boolean
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-last-fingerprint
  (deferred-tru "Internal bookkeeping: Fingerprint of last successful run, to prevent needless re-calculations.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(defsetting data-complexity-scoring-claim
  (deferred-tru "Internal bookkeeping: EDN metadata with TTL for in-progress run, to skip duplicate work.")
  :encryption :no
  :visibility :internal
  :default    ""
  :type       :string
  :export?    false
  :doc        false)

(def ^:const max-level
  "The highest level this build of the scorer actually implements. Levels above this are accepted
  (defsetting is typed `:integer`) but clamped at the call site — operators who set level=3 today
  won't get structural metrics, but they also won't get an error when those land."
  2)

(defsetting semantic-complexity-level
  (deferred-tru
   (str "How much detail to include when computing the data-complexity-score. "
        "0 = skip scoring entirely. "
        "1 = cheap metrics only (entity/field counts, name collisions, metadata coverage). "
        "2 = (default) adds semantic graph metrics computed over the existing embedding index. "
        "3 = adds join-graph structural metrics (not yet implemented — clamped to 2 for now)."))
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false
  :encryption :no
  :doc        false)

(defn clamp-level
  "Clamp `raw` to `[0, max-level]`. Use at every level-consuming site — an out-of-range setting or
  caller-supplied override must never make the scorer skip or crash."
  ^long [raw]
  (max 0 (min ^long max-level ^long (or raw 0))))

(defn effective-level
  "Read the setting and clamp to [0, max-level]."
  ^long []
  (clamp-level (semantic-complexity-level)))
