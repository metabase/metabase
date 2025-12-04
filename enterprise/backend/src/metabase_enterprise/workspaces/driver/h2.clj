(ns metabase-enterprise.workspaces.driver.h2
  "H2-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]))

;; TODO Either support h2 fully, or update tests not to use h2
(defmethod isolation/init-workspace-database-isolation! :h2
  [database workspace]
  (let [driver      (driver.u/database->driver database)
        schema-name (driver.common/isolation-namespace-name workspace)
        jdbc-spec   (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (jdbc/execute! jdbc-spec [(format "CREATE SCHEMA %s" schema-name)])))
