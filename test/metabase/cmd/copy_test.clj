(ns metabase.cmd.copy-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy :as copy]
   [metabase.models :refer [Database]]
   [metabase.plugins.classloader :as classloader]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(deftest ^:parallel sql-for-selecting-instances-from-source-db-test
  (are [table-name] (re-find #"(?i)SELECT \* FROM METABASE_DATABASE WHERE engine <> 'h2'"
                             (#'copy/sql-for-selecting-instances-from-source-db table-name))
    (t2/table-name Database)
    :METABASE_DATABASE
    "metabase_database")
  ;; make sure the H2 `test-data` DB is loaded
  (mt/db)
  (let [sql              (#'copy/sql-for-selecting-instances-from-source-db (t2/table-name Database))
        selected-drivers (t2/select-fn-set :engine Database sql)]
    (is (not (contains? selected-drivers :h2)))))

(deftest ^:parallel allow-loading-h2-databases-test
  (testing `copy/*allow-loading-h2-databases*
    (binding [copy/*allow-loading-h2-databases* true]
      (is (= "SELECT * FROM metabase_database"
             (#'copy/sql-for-selecting-instances-from-source-db (t2/table-name Database)))))))

(deftest ^:paralell all-models-accounted-for-test
  ;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities
  (let [migrated-model-names (set (map :name copy/entities))
        ;; Models that should *not* be migrated in `load-from-h2`.
        models-to-exclude    #{"TaskHistory" "Query" "QueryCache" "QueryExecution" "CardFavorite" "DashboardFavorite"}
        all-model-names      (set (for [ns       u/metabase-namespace-symbols
                                        :when    (or (re-find #"^metabase\.models\." (name ns))
                                                     (= (name ns) "metabase.db.data-migrations"))
                                        :when    (not (re-find #"test" (name ns)))
                                        [_ varr] (do (classloader/require ns)
                                                     (ns-interns ns))
                                        :let     [{model-name :name, :as model} (var-get varr)]
                                        :when    (and (models/model? model)
                                                      (not (contains? models-to-exclude model-name)))]
                                    model-name))]
    (is (= all-model-names migrated-model-names))))
