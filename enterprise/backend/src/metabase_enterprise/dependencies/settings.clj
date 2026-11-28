(ns metabase-enterprise.dependencies.settings
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting :refer [defsetting]])
  (:import
   (com.mchange.v2.c3p0 WrapperConnectionPoolDataSource)
   (com.mchange.v2.c3p0.impl AbstractPoolBackedDataSource)))

(set! *warn-on-reflection* true)

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

(defn- default-job-threads
  "The thread count when none is set, on `cores` CPU cores and an application database pool of `pool-size`
  connections, leaving most of the pool to the rest of the instance."
  [cores pool-size]
  (min 4 cores (max 1 (quot pool-size 4))))

(defn- app-db-max-pool-size
  "The most connections the app DB's c3p0 pool holds, or c3p0's default of 15 when the app DB isn't one."
  []
  (let [data-source (mdb/data-source)
        pool-source (when (instance? AbstractPoolBackedDataSource data-source)
                      (.getConnectionPoolDataSource ^AbstractPoolBackedDataSource data-source))]
    (if (instance? WrapperConnectionPoolDataSource pool-source)
      (.getMaxPoolSize ^WrapperConnectionPoolDataSource pool-source)
      15)))

(defsetting dependency-job-threads
  "How many entities of a batch each dependency job computes at the same time when run on demand, at least 1;
  scheduled runs use one thread. Each thread can use an application database connection, in addition to the one the
  job uses. Unset, it is the smallest of 4, the number of CPU cores, and a quarter of the application database's
  maximum connection pool size, at least 1."
  :visibility :internal
  :type       :integer
  :setter     :none
  :export?    false
  :getter     #(max 1 (or (setting/get-value-of-type :integer :dependency-job-threads)
                          (default-job-threads (.availableProcessors (Runtime/getRuntime))
                                               (app-db-max-pool-size)))))

(defsetting dependency-max-failures
  "How many times in a row a dependency job fails to process an entity before it gives up on it until a write changes
  it."
  :visibility :internal
  :type       :integer
  :default    3
  :setter     :none
  :export?    false)
