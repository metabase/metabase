(ns metabase.test-util
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [metabase.config :refer [app-defaults]]
            [metabase.db :refer [get-db-file]]))


(defn liquibase-up
  "Run Liquibase migrations update"
  []
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname (get-db-file)})]
    (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)))

(defn liquibase-down
  "Run Liquibase migrations rollback"
  []
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname (get-db-file)})]
    (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn)))