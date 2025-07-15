(ns metabase-enterprise.semantic-search.db
  (:require [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [next.jdbc :as jdbc]))

(def data-source (atom nil))

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

(defn maybe-init-db!
  "Initialize the database connection pool if it hasn't been initialized yet."
  []
  (when (nil? @data-source)
    (init-db!)))

(defn execute! [query & params]
  (jdbc/execute! @data-source query params))

(defn execute-one! [query & params]
  (jdbc/execute-one! @data-source query params))

(defn test-connection!
  "Test database connectivity"
  []
  (try
    (let [result (execute-one! ["SELECT 1 as test"])]
      (log/info "Database connection successful:" result)
      result)
    (catch Exception e
      (log/error "Database connection failed:" (.getMessage e))
      (throw e))))

(comment
  (init-db!)
  (test-connection!))
