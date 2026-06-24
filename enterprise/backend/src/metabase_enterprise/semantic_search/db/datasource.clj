(ns metabase-enterprise.semantic-search.db.datasource
  (:require
   [environ.core :refer [env]]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (com.mchange.v2.c3p0 DataSources PooledDataSource)))

(set! *warn-on-reflection* true)

(def data-source
  "Atom to hold the pooled JDBC data source for the semantic search database."
  (atom nil))

(def db-url
  "The database URL used to connect to pgvector"
  (env :mb-pgvector-db-url))

;; Env-var knobs (read once at pool construction) so operators can cap resource usage when many Metabase
;; instances share one pgvector RDS. Cf. metabase.app-db.connection-pool-setup for the analogous app-db pool.
(defn- connection-pool-props
  "Connection pool properties for the semantic search database using c3p0."
  []
  (let [min-pool-size (or (config/config-int :mb-pgvector-db-min-pool-size) 0)]
    {"idleConnectionTestPeriod"     60
     "maxIdleTimeExcessConnections" (* 10 60)  ; cull excess idle connections after 10 minutes
     "maxConnectionAge"             (* 30 60)  ; recycle any connection after 30 minutes
     ;; 0 idle connections is what makes a shared RDS viable. Cold start costs one handshake, warmed
     ;; concurrently with the embedding round-trip (see semantic-search.index/query-index). Set
     ;; MB_PGVECTOR_DB_MIN_POOL_SIZE=1 to pin a warm connection on a hot instance.
     "minPoolSize"                  min-pool-size
     "initialPoolSize"              min-pool-size
     ;; c3p0 defaults to 3 per miss; 1 avoids tripling the cold-start burst on the shared RDS.
     "acquireIncrement"             1
     "maxPoolSize"                  (or (config/config-int :mb-pgvector-db-max-connection-pool-size) 5)
     ;; Fail fast on pool exhaustion (c3p0 default 0 blocks forever); the engine falls back to appdb
     ;; search on error (see semantic-search.core/results).
     "checkoutTimeout"              (or (config/config-int :mb-pgvector-db-checkout-timeout-ms) 10000)
     ;; c3p0's leak detector, off by default: it destroys connections by checkout *duration*, so any value
     ;; low enough to catch leaks also kills slow work (reindex DDL, bulk upserts). Enable with the
     ;; stack-traces knob on a canary to hunt a suspected leak.
     "unreturnedConnectionTimeout" (or (config/config-int :mb-pgvector-db-unreturned-connection-timeout-seconds) 0)
     "debugUnreturnedConnectionStackTraces"
     (boolean (config/config-bool :mb-pgvector-db-debug-unreturned-connection-stack-traces))
     ;; Off by default (idleConnectionTestPeriod covers idle conns); matches app-db. Flip on if the shared
     ;; RDS drops connections under the pool.
     "testConnectionOnCheckout"    (boolean (config/config-bool :mb-pgvector-db-test-connection-on-checkout))
     "dataSourceName"              "metabase-semantic-search-db"}))

(defn- build-db-config
  "Build database configuration from environment variables"
  []
  (if db-url
    {:jdbcUrl db-url}
    (throw (ex-info "MB_PGVECTOR_DB_URL environment variable is required for semantic search" {}))))

(defn shutdown-db!
  "Close the pooled data source (if any) and clear it, releasing all server-side connections.
  Safe to call when the pool was never initialized; a later [[init-db!]] builds a fresh pool."
  []
  (locking data-source
    (when-let [ds @data-source]
      (reset! data-source nil)
      (log/info "Closing semantic search connection pool")
      (.close ^PooledDataSource ds))))

;; Tests redef [[data-source]] and close their pools themselves; this hook only sees the root binding,
;; so it closes at most the production pool.
(defonce ^:private shutdown-hook
  (delay (.addShutdownHook (Runtime/getRuntime)
                           (Thread. ^Runnable shutdown-db! "semantic-search-pool-shutdown"))))

(defn init-db!
  "Initialize c3p0 connection pool for semantic search database.
   Requires MB_PGVECTOR_DB_URL environment variable."
  []
  (locking data-source
    (or @data-source
        (let [db-config   (build-db-config)
              pool-props  (connection-pool-props)
              unpooled-ds (jdbc/get-datasource db-config)
              pooled-ds   (DataSources/pooledDataSource
                           ^javax.sql.DataSource unpooled-ds
                           (connection-pool/map->properties pool-props))]
          (log/info "Initializing semantic search connection pool with properties:" pool-props)
          (force shutdown-hook)
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
