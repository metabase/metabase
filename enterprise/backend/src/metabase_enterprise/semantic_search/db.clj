(ns metabase-enterprise.semantic-search.db
  (:require [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [next.jdbc :as jdbc]))

(def data-source (atom nil))

(defn- build-db-config
  "Build database configuration from environment variables"
  []
  (if-let [db-url (env :pg-url)]
    {:jdbcUrl db-url}
    {:dbtype "postgres"
     :host (env :pg-host "localhost")
     :port (env :pg-port 55432)
     :dbname (env :pg-database "mb_semantic_search")
     :user (env :pg-user)
     :password (env :pg-password)
     :sslmode (env :pg-sslmode "prefer")}))

(defn init-db!
  "Initialize database connection pool from environment variables.
   Uses DB_URL if provided, otherwise falls back to individual env vars:
   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE, PG_SSLMODE"
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
