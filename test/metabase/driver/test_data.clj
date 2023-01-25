(ns metabase.driver.test-data
  "Code for converting EDN dataset definitions to dumps that can be into various databases, e.g. SQL, CSV, etc."
  (:require
   [metabase.driver :as driver]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]))

(defmulti dataset-steps
  "Should dump a series of steps to drop old versions of the dataset as needed and initialize things like a database,
  e.g.

    [{:type :sql, :context :server, :sql [\"DROP DATABASE IF EXISTS my_database;\"]}
     {:type :sql, :context :server, :sql [\"CREATE DATABASE my_database;\"]}]"
  {:arglists '([driver dbdef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti init-steps
  "Steps for initializing the database before defining tables, e.g. `CREATE DATABASE` and the like."
  {:arglists '([driver dbdef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti create-table-steps
  "Steps for creating a table from a table definition, such as `CREATE TABLE`, etc."
  {:arglists '([driver dbdef tabledef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti load-data-steps
  "Steps for creating a table from a table definition, such as `CREATE TABLE`, etc."
  {:arglists '([driver dbdef tabledef]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defn- get-dataset [dataset]
  (let [resolved (cond
                   (and (symbol? dataset)
                        (namespace dataset))
                   (data.impl/resolve-dataset-definition (symbol (namespace dataset)) (symbol (name dataset)))

                   (symbol? dataset)
                   (data.impl/resolve-dataset-definition 'metabase.test.data.dataset-definitions dataset)

                   :else dataset)]
    (tx/get-dataset-definition resolved)))

(defmethod dataset-steps :default
  [driver dataset]
  {:pre [(keyword? driver)]}
  (let [{:keys [table-definitions], :as dbdef} (get-dataset dataset)]
    (concat
     (init-steps driver dbdef)
     (mapcat (fn [tabledef]
               (create-table-steps driver dbdef tabledef))
             table-definitions)
     (mapcat (fn [tabledef]
               (load-data-steps driver dbdef tabledef))
             table-definitions))))
