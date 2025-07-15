(ns metabase-enterprise.semantic-search.db
  (:require
   [environ.core :refer [env]]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(def data-source
  "Atom to hold the JDBC data source for the semantic search database."
  (atom nil))

(defn- build-db-config
  "Build database configuration from environment variables"
  []
  (if-let [db-url (env :mb-pgvector-db-url)]
    {:jdbcUrl db-url}
    (throw (ex-info "MB_PGVECTOR_DB_URL environment variable is required for semantic search" {}))))

(defn init-db!
  "Initialize database connection pool from environment variables.
   Requires MB_PGVECTOR_DB_URL environment variable."
  []
  (let [db-config (build-db-config)
        ds (jdbc/get-datasource db-config)]
    (reset! data-source ds)))

(defn test-connection!
  "Test database connectivity"
  []
  (if @data-source
    (try
      (let [result (jdbc/execute-one! @data-source ["SELECT 1 as test"])]
        (log/info "Database connection successful:" result)
        result)
      (catch Exception e
        (log/error "Database connection failed:" (.getMessage e))
        (throw e)))
    (throw (ex-info "Database connection pool is not initialized. Call init-db! first." {}))))

(comment
  (init-db!)
  (test-connection!))
