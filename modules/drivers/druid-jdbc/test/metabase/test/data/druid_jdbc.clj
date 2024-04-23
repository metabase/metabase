(ns metabase.test.data.druid-jdbc
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.druid-jdbc.ingestion :as tx.druid-jdbc.ingestion]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]))

(tx/add-test-extensions! :druid-jdbc)

(defmethod tx/dbdef->connection-details :druid-jdbc
  [& _]
  {:host "localhost"
   :port "8888"})

;; TODO: Use tx/dbdef->connection-details.
(defn- already-loaded []
  (set (json/parse-string (:body (http/get "http://localhost:8888/druid/v2/datasources")))))

;; This has to be changed! -- maybe old stashes contain the modification
#_(defmethod tx/create-db! :druid-jdbc
    [_ dbdef & _]
    (let [{:keys [database-name], :as _dbdef} (tx/get-dataset-definition dbdef)]
      (assert (= database-name "checkins")
              "Druid tests currently only support the flattened test-data dataset.")
      (assert (contains? (already-loaded) "checkins")
              "Expected 'checkins' dataset to be present in Druid datasources. (This should be loaded as part of building Docker image)")
      nil))

(def built-in-datasets #{"checkins" "json"})

(defmethod tx/create-db! :druid-jdbc
  [_ dbdef & _]
  (let [{:keys [database-name], :as _dbdef} dbdef]
    ;; TODO: Notion of builtin datasets.
    (def xixi database-name)
    (if (built-in-datasets database-name)
      (log/info "Using `checkins` built in database. No ingestion will be performed.")
      ;; `ingest-dataset!` expects dataset preprocessed accordingly. In case of Druid JDBC, that means:
      ;;   10. Adding table ids
      ;;   20. Adding coercion to temporal columns -- Druid reports only the __time column as TIMESTAMP, thus the other
      ;;       columns are stored as numbers and converted to timestamp
      ;;   30. Renaming of tables and fields. In case of Druid JDBC that means mapping of database-table-column
      ;;       to Druid's datasource-column model.
      ;;
      ;; Preprocessing happens in [[data.impl/get-or-create-database!]] (At the moment. Elaborate!)
      (tx.druid-jdbc.ingestion/ingest-dataset! dbdef))))


  (defmethod tx/destroy-db! :druid-jdbc
    [& _]
    nil)

  (defmethod tx/default-dataset :druid-jdbc
    [_]
    #_(tx/flattened-dataset-definition defs/test-data "checkins")
    defs/test-data)

  (defmethod data.impl/get-or-create-database! :druid-jdbc
    [_driver dbdef]
    (let [ds (-> dbdef
                 ;; TODO: Verify we can remove the following!
                 tx/get-dataset-definition
                 tx.druid-jdbc.ingestion/preprocess-dataset)
          parent-method (get-method data.impl/get-or-create-database! :sql-jdbc)]
      (parent-method :druid-jdbc ds)))