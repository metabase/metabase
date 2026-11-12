(ns metabase-enterprise.dependencies.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting dependency-backfill-batch-size
  "The number of entities that the dependency job will process per run."
  :visibility :internal
  :type       :integer
  :default    500
  :setter     :none
  :export?    false)

(defsetting dependency-backfill-delay-minutes
  "The average delay before the dependency job runs again after a run that failed."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-backfill-variance-minutes
  "The variation of the dependency job's delay after a failed run, which is a random value within this many minutes of
  `dependency-backfill-delay-minutes`, and the longest random delay of its first run after startup."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-batch-size
  "The number of entities that the analysis finding job will process per run."
  :visibility :internal
  :type       :integer
  :default    500
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-delay-minutes
  "The average delay before the analysis finding job runs again after a run that failed."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-variance-minutes
  "The variation of the analysis finding job's delay after a failed run, which is a random value within this many
  minutes of `dependency-entity-check-delay-minutes`, and the longest random delay of its first run after startup."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)

(defsetting dependency-result-metadata-batch-size
  "The number of entities that the result metadata job will process per run."
  :visibility :internal
  :type       :integer
  :default    500
  :setter     :none
  :export?    false)

(defsetting dependency-result-metadata-delay-minutes
  "The average delay before the result metadata job runs again after a run that failed."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-result-metadata-variance-minutes
  "The variation of the result metadata job's delay after a failed run, which is a random value within this many
  minutes of `dependency-result-metadata-delay-minutes`, and the longest random delay of its first run after startup."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)

(defsetting dependency-max-failures
  "How many times in a row a dependency job fails to process an entity before it gives up on it until a write changes
  it."
  :visibility :internal
  :type       :integer
  :default    3
  :setter     :none
  :export?    false)
