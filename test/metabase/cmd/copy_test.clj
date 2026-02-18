(ns metabase.cmd.copy-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [metabase.classloader.core :as classloader]
   [metabase.cmd.copy :as copy]))

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
  #{:model/AnalysisFinding
    :model/AnalysisFindingError
    :model/ApiKey
    :model/CacheConfig
    :model/CardFavorite
    :model/CloudMigration
    :model/ContentTranslation
    :model/DashboardFavorite
    :model/DatabaseRouter
    :model/Dependency
    :model/PythonLibrary
    :model/PremiumFeaturesCache
    :model/Query
    :model/QueryCache
    :model/QueryExecution
    :model/QueryField
    :model/QueryTable
    :model/RemoteSyncObject
    :model/RemoteSyncTask
    :model/SearchIndexMetadata
    :model/SemanticSearchTokenTracking
    :model/SupportAccessGrantLog
    :model/TaskHistory
    :model/TaskRun
    ;; TODO we should remove these models from here once serialization is supported
    :model/Transform
    :model/TransformRun
    :model/TransformRunCancelation
    :model/TransformJob
    :model/TransformJobRun
    :model/TransformJobTransformTag
    :model/TransformTag
    :model/TransformTransformTag
    :model/Undo
    :model/UserKeyValue
    :model/Workspace
    :model/WorkspaceGraph
    :model/WorkspaceInput
    :model/WorkspaceInputExternal
    :model/WorkspaceLog
    :model/WorkspaceMerge
    :model/WorkspaceMergeTransform
    :model/WorkspaceOutput
    :model/WorkspaceOutputExternal
    :model/WorkspaceTransform})

(defn- all-model-names []
  (into (sorted-set)
        (comp (filter #(= (namespace %) "model"))
              (remove models-to-exclude))
        (descendants :metabase/model)))

(deftest ^:parallel all-models-accounted-for-test
  ;; make sure the entire system is loaded before running this test, to make sure we account for all the models.
  (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
          :when   (and (str/starts-with? ns-symb "metabase")
                       (not (str/includes? ns-symb "test")))]
    (classloader/require ns-symb))
  (doseq [model (all-model-names)
          :let  [copy-models (set copy/entities)]]
    (is (contains? copy-models model)
        (format "%s should be added to %s, or to %s" model `copy/entities `models-to-exclude))))
