(ns metabase-enterprise.worker-db.migrations
  "Database migration utilities for worker databases."
  (:require
   [clojure.core :exclude [run!]]
   [clojure.java.io :as io]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (javax.sql DataSource)
   (liquibase Contexts LabelExpression Liquibase)
   (liquibase.database Database DatabaseFactory)
   (liquibase.database.jvm JdbcConnection)
   (liquibase.resource ClassLoaderResourceAccessor ResourceAccessor)))

(set! *warn-on-reflection* true)

(mu/defn- run-migrations-from-resource!
  "Run Liquibase migrations from a resource file in the classpath.

  Parameters:
  - data-source: A javax.sql.DataSource for the target database
  - resource-path: Path to the Liquibase changelog file in resources (e.g. \"migrations/my-db-changelog.yaml\")

  Example:
    (run-migrations-from-resource! my-datasource \"migrations/external-db-changelog.yaml\")"
  [data-source :- (ms/InstanceOfClass DataSource)
   resource-path :- :string]
  (log/info "Running migrations from resource:" resource-path)

  ;; Verify the resource exists
  (when-not (io/resource resource-path)
    (throw (ex-info (str "Migration resource not found: " resource-path)
                    {:resource-path resource-path})))

  ;; Create Liquibase instance manually with custom changelog
  (with-open [^java.sql.Connection conn (.getConnection ^DataSource data-source)]
    (let [^JdbcConnection liquibase-conn (JdbcConnection. conn)
          ^Database database (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)
          ^ResourceAccessor resource-accessor (ClassLoaderResourceAccessor. (classloader/the-classloader))
          ^Liquibase lb (Liquibase. ^String resource-path resource-accessor database)]
      ;; Run the migrations
      (try
        (log/info "Starting migration execution for" resource-path)
        (.update lb (Contexts.) (LabelExpression.))
        (log/info "Successfully completed migrations from" resource-path)
        :success
        (catch Exception e
          (log/error e "Failed to run migrations from" resource-path)
          (throw e))))))

(mu/defn- run-migrations-from-resource-with-connection-string!
  "Run Liquibase migrations from a resource file using a JDBC connection string.

  Parameters:
  - connection-string: JDBC connection string (e.g. \"jdbc:postgresql://localhost/mydb?user=myuser&password=mypass\")
  - resource-path: Path to the Liquibase changelog file in resources (e.g. \"migrations/my-db-changelog.yaml\")

  Example:
    (run-migrations-from-resource-with-connection-string!
      \"jdbc:postgresql://localhost/mydb?user=myuser&password=mypass\"
      \"migrations/external-db-changelog.yaml\")"
  [connection-string :- :string
   resource-path :- :string]
  (log/info "Running migrations from resource:" resource-path "with connection:" connection-string)

  ;; Verify the resource exists
  (when-not (io/resource resource-path)
    (throw (ex-info (str "Migration resource not found: " resource-path)
                    {:resource-path resource-path})))

  ;; Create Liquibase instance manually with custom changelog and connection string
  (with-open [^java.sql.Connection conn (java.sql.DriverManager/getConnection connection-string)]
    (let [^JdbcConnection liquibase-conn (JdbcConnection. conn)
          ^Database database (.findCorrectDatabaseImplementation (DatabaseFactory/getInstance) liquibase-conn)
          ^ResourceAccessor resource-accessor (ClassLoaderResourceAccessor. (classloader/the-classloader))
          ^Liquibase lb (Liquibase. ^String resource-path resource-accessor database)]
      ;; Run the migrations
      (try
        (log/info "Starting migration execution for" resource-path)
        (.update lb (Contexts.) (LabelExpression.))
        (log/info "Successfully completed migrations from" resource-path)
        :success
        (catch Exception e
          (log/error e "Failed to run migrations from" resource-path)
          (throw e))))))

(defn run!
  "Run migrations for the worker."
  []
  (let [worker-db-connection-string (config/config-str :mb-worker-db)]
    (run-migrations-from-resource-with-connection-string! worker-db-connection-string
                                                          "migrations/workers/worker_runs.yaml")))

(comment

  (run-migrations-from-resource-with-connection-string! "jdbc:postgresql://localhost:5432/worker"
                                                        "migrations/workers/worker_runs.yaml"))
