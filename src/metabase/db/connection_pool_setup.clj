(ns metabase.db.connection-pool-setup
  "Code for creating the connection pool for the application DB and setting it as the default Toucan connection."
  (:require [metabase.config :as config]
            [metabase.connection-pool :as connection-pool]
            [schema.core :as s])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

(def ^:private application-db-connection-pool-props
  "Options for c3p0 connection pool for the application DB. These are set in code instead of a properties file because
  we use separate options for data warehouse DBs. See
  https://www.mchange.com/projects/c3p0/#configuring_connection_testing for an overview of the options used
  below (jump to the 'Simple advice on Connection testing' section.)"
  (merge
   {"idleConnectionTestPeriod" 60}
   ;; only merge in `max-pool-size` if it's actually set, this way it doesn't override any things that may have been
   ;; set in `c3p0.properties`
   (when-let [max-pool-size (config/config-int :mb-application-db-max-connection-pool-size)]
     {"maxPoolSize" max-pool-size})))

(s/defn connection-pool-data-source :- PoolBackedDataSource
  "Create a connection pool [[javax.sql.DataSource]] from an unpooled [[javax.sql.DataSource]] `data-source`. If
  `data-source` is already pooled, this will return `data-source` as-is."
  [db-type     :- s/Keyword
   data-source :- javax.sql.DataSource]
  (if (instance? PoolBackedDataSource data-source)
    data-source
    (let [ds-name    (format "metabase-%s-app-db" (name db-type))
          pool-props (assoc application-db-connection-pool-props "dataSourceName" ds-name)]
      (com.mchange.v2.c3p0.DataSources/pooledDataSource
       data-source
       (connection-pool/map->properties pool-props)))))
