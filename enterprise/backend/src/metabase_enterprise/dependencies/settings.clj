(ns metabase-enterprise.dependencies.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting dependency-backfill-batch-size
  "Batch size."
  :visibility :internal
  :type       :integer
  :default    500
  :setter     :none
  :export?    false)

(defsetting dependency-backfill-delay-minutes
  "Backfill delay in minutes."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-backfill-variance-minutes
  "Backfill variance (?) whatever that means."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)

(defsetting card-metadata-refresh-batch-size
  "Batch size for the background job that refreshes the saved metadata of cards with upstream changes."
  :visibility :internal
  :type       :integer
  :default    50
  :setter     :none
  :export?    false)

(defsetting card-metadata-refresh-delay-ms
  "Card metadata refresh interval in millliseconds. Note that the delay will always be at least 10x longer than the run time."
  :visibility :internal
  :type       :integer
  :default    10000
  :setter     :none
  :export?    false)

(defsetting card-metadata-refresh-variance-ms
  "Card metadata refresh variance in milliseconds. The refresh delay is adjusted randomly up or down by up to his amount. Prevents rhythmic loads on a cluster."
  :visibility :internal
  :type       :integer
  :default    3000
  :setter     :none
  :export?    false)
