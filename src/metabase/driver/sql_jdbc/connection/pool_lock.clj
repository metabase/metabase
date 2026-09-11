(ns metabase.driver.sql-jdbc.connection.pool-lock
  "The monitor serializing c3p0 pool creation against reads of c3p0's JMX attributes.

  Holding it on both sides is required to avoid a deadlock inside c3p0: reading a JMX attribute locks a
  DynamicPooledDataSourceManagerMBean and then a PoolBackedDataSource, while
  `com.mchange.v2.c3p0.DataSources/pooledDataSource` locks the two in the opposite order. See
  https://github.com/swaldman/c3p0/issues/95

  Carries no requires so that the JMX reader can take the same monitor without loading the driver.")

(defonce ^{:doc "The monitor object. Take it with `locking`."} monitor
  (Object.))
