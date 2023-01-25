(ns metabase.test.data.sql-jdbc
  "Common test extension functionality for SQL-JDBC drivers."
  (:require
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [metabase.driver :as driver]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.initialize :as initialize]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(driver/register! :sql-jdbc/test-extensions, :abstract? true)

(sql.tx/add-test-extensions! :sql-jdbc/test-extensions)

(defn add-test-extensions! [driver]
  (initialize/initialize-if-needed! :plugins)
  (driver/add-parent! driver :sql-jdbc/test-extensions)
  (log/infof "Added SQL JDBC test extensions for %s ➕" driver))

(methodical/defmethod tx/load-dataset-step! [:sql-jdbc :default :sql]
  [driver dataset-name {:keys [file context], :as _step}]
  (when-not file
    (throw (ex-info "Step should include 'file:'" {})))
  (let [context (keyword context)]
    (when-not (#{:db :server} context)
      (throw (ex-info "Step should include either 'context: db' or 'context: server'" {})))
    (let [file-name-in-class-path (format "%s/%s" (name driver) file)
          resource                (or (io/resource file-name-in-class-path)
                                      (throw (ex-info (format "Cannot find %s in class path"
                                                              (pr-str file-name-in-class-path))
                                                      {:filename file-name-in-class-path})))
          sql                     (slurp resource)]
      (log/infof "Execute SQL from file %s" (pr-str file-name-in-class-path))
      (execute/execute-sql! driver context {:database-name (name dataset-name)} sql))))
