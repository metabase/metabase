(ns metabase.cmd.copy-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [metabase.cmd.copy :as copy]
   [metabase.plugins.classloader :as classloader]))

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

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{:model/ApiKey
    :model/CacheConfig
    :model/CardFavorite
    :model/CloudMigration
    :model/DashboardFavorite
    :model/FieldUsage
    :model/LegacyMetric
    :model/LegacyMetricImportantField
    :model/Query
    :model/QueryAnalysis
    :model/QueryCache
    :model/QueryExecution
    :model/QueryField
    :model/QueryTable
    :model/TaskHistory})

(defn- all-model-names []
  (into (sorted-set)
        (comp (filter #(= (namespace %) "model"))
              (remove models-to-exclude))
        (descendants :metabase/model)))

(deftest ^:paralell all-models-accounted-for-test
  ;; make sure the entire system is loaded before running this test, to make sure we account for all the models.
  (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
          :when   (and (str/starts-with? ns-symb "metabase")
                       (not (str/includes? ns-symb "test")))]
    (classloader/require ns-symb))
  (doseq [model (all-model-names)
          :let  [copy-models (set copy/entities)]]
    (is (contains? copy-models model)
        (format "%s should be added to %s, or to %s" model `copy/entities `models-to-exclude))))
