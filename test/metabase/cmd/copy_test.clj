(ns metabase.cmd.copy-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy :as copy]
   [metabase.db.util :as mdb.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]))

(deftest ^:parallel sql-for-selecting-instances-from-source-db-test
  (is (= "SELECT * FROM metabase_field ORDER BY id ASC"
         (#'copy/sql-for-selecting-instances-from-source-db :model/Field))))

(deftest ^:parallel copy-h2-database-details-test
  (doseq [copy-h2-database-details? [true false]]
    (testing (str `copy/*copy-h2-database-details* " = " copy-h2-database-details?)
      (binding [copy/*copy-h2-database-details* copy-h2-database-details?]
        (is (= [{:id 1, :engine "h2", :details (if copy-h2-database-details? "{:db \"metabase.db\"}" "{}")}
                {:id 2, :engine "postgres", :details "{:db \"metabase\"}"}]
               (into
                []
                (#'copy/model-results-xform :model/Database)
                [{:id 1, :engine "h2", :details "{:db \"metabase.db\"}"}
                 {:id 2, :engine "postgres", :details "{:db \"metabase\"}"}])))))))

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
                                        :when    (and (mdb.u/toucan-model? model)
                                                      (not (contains? models-to-exclude model-name)))]
                                    model-name))]
    (is (= all-model-names migrated-model-names))))
