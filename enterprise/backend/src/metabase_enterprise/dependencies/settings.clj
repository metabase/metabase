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
