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
  "The average delay between when the dependency job will run."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-backfill-variance-minutes
  "The variation in when the dependency job will run.  The actual delay between runs will be a random value
  between `dependency-backfill-delay-minutes - dependency-backfill-variance-minutes` and
  `dependency-backfill-delay-minutes + dependency-backfill-variance-minutes`."
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
  "The average delay between when the analysis finding job will run."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-variance-minutes
  "The variation in when the analysis finding job will run.  The actual delay between runs will be a random value
  between `dependency-entity-check-delay-minutes - dependency-entity-check-variance-minutes` and
  `dependency-entity-check-delay-minutes + dependency-entity-check-variance-minutes`."
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
  "The average delay between runs of the result metadata job when it has retries pending, and the backoff per failure
  of an entity it retries."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-result-metadata-variance-minutes
  "The variation in when the result metadata job will run.  The actual delay between runs will be a random value
  between `dependency-result-metadata-delay-minutes - dependency-result-metadata-variance-minutes` and
  `dependency-result-metadata-delay-minutes + dependency-result-metadata-variance-minutes`."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)
