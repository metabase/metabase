(ns metabase-enterprise.semantic-search.db.datasource
  (:require
   [environ.core :refer [env]]
   [metabase.connection-pool :as connection-pool]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (com.mchange.v2.c3p0 DataSources)))

(set! *warn-on-reflection* true)

(def data-source
  "Atom to hold the pooled JDBC data source for the semantic search database."
  (atom nil))

(def db-url
  "The database URL used to connect to pgvector"
  (env :mb-pgvector-db-url))

;; See metabase.app-db.connection-pool-setup for more details on these properties
;; TODO: not sure if we need the MetabaseConnectionCustomizer like in the app DB connection pool setup
(def ^:private semantic-search-connection-pool-props
  "Connection pool properties for semantic search database using c3p0."
  {"idleConnectionTestPeriod"     60
   "maxIdleTimeExcessConnections" (* 10 60)  ; 5 minutes
   "maxConnectionAge"             (* 30 60)  ; 30 minutes
   "maxPoolSize"                  5          ; Small pool to start
   "minPoolSize"                  1
   "initialPoolSize"              1
   "dataSourceName"               "metabase-semantic-search-db"})

(defn- build-db-config
  "Build database configuration from environment variables"
  []
  (if db-url
    {:jdbcUrl db-url}
    (throw (ex-info "MB_PGVECTOR_DB_URL environment variable is required for semantic search" {}))))

(defn init-db!
  "Initialize c3p0 connection pool for semantic search database.
   Requires MB_PGVECTOR_DB_URL environment variable."
  []
  (locking data-source
    (or @data-source
        (let [db-config   (build-db-config)
              unpooled-ds (jdbc/get-datasource db-config)
              pooled-ds   (DataSources/pooledDataSource
                           ^javax.sql.DataSource unpooled-ds
                           (connection-pool/map->properties semantic-search-connection-pool-props))]
          (log/info "Initializing semantic search connection pool with properties:" semantic-search-connection-pool-props)
          (reset! data-source pooled-ds)))))

(defn test-connection!
  "Test database connectivity"
  []
  (if @data-source
    (try
      (let [result (jdbc/execute-one! @data-source ["SELECT 1 as test"])]
        (log/info "Semantic search database connection successful:" result)
        result)
      (catch Exception e
        (log/error "Semantic search database connection failed:" (.getMessage e))
        (throw e)))
    (throw (ex-info "Semantic search connection pool is not initialized. Call init-db! first." {}))))

(comment
  ;; docker-compose.yml
  (.doReset #'db-url "jdbc:postgres://localhost:55432/mb_semantic_search?user=postgres&password=postgres")
  (init-db!)
  (test-connection!))

(defn ensure-initialized-data-source!
  "Return datasource. Initialize if necessary."
  []
  (or @data-source (init-db!)))
