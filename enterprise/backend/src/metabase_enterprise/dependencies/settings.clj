(ns metabase-enterprise.dependencies.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting dependency-entity-check-batch-size
  "The number of entities that the entity check job will process per run."
  :visibility :internal
  :type       :integer
  :default    500
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-delay-minutes
  "The average delay between when the entity check job will run."
  :visibility :internal
  :type       :integer
  :default    60
  :setter     :none
  :export?    false)

(defsetting dependency-entity-check-variance-minutes
  "The variation in when the entity check job will run.  The actual delay between runs will be a random value
  between `dependency-entity-check-delay-minutes - dependency-entity-check-variance-minutes` and
  `dependency-entity-check-delay-minutes + dependency-entity-check-variance-minutes`."
  :visibility :internal
  :type       :integer
  :default    30
  :setter     :none
  :export?    false)
