(ns metabase.driver.sql-jdbc.connection.pool-lock
  "The monitor that serializes warehouse pool creation, so two threads cannot build pools for the same database at
  once. Query execution waits on it whenever a warehouse pool does not exist yet, so take it only around pool creation
  and never around anything slow.")

(defonce ^{:doc "The monitor object. Take it with `locking`."} monitor
  (Object.))
