(ns ^:mb/driver-tests metabase-enterprise.transform-testing.reported-type-test
  "The `database_type` a run reports is the transform output table's own, not the comparison query's
  and not the cast target the author declared."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transform-testing.executor :as transform-testing.executor]
   [metabase-enterprise.transform-testing.runner :as transform-testing.runner]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(def ^:private cases
  "Per driver: the input fixture, the type the author declares for the output column, and the two
  type the transform's output column really has. The declared one is a cast target and is not a column
  type: `SIGNED` is not a type name MySQL ever reports, and `Nullable(Int32)` is not what the
  transform produced."
  {:mysql      {:input-sql "SELECT 1 AS id"
                :declared  "SIGNED"
                :produced  "INTEGER"}
   :clickhouse {:input-sql "SELECT CAST(1 AS Int64) AS id"
                :declared  "Nullable(Int32)"
                :produced  "Int64"}})

(defn- output-column-type!
  "The type the transform's output column really has, materialized the way the runner materializes it."
  [driver sql]
  (driver/do-with-test-connection
   driver
   (mt/db)
   (fn [conn]
     (let [table (driver/temp-table-name driver)]
       (try
         (transform-testing.executor/create-temp-table! driver conn table {:query sql :params []})
         (:database_type (first (transform-testing.executor/table-columns driver conn table)))
         (finally
           (transform-testing.executor/drop-temp-table! driver conn table)))))))

(deftest reported-type-is-the-output-tables-test
  (mt/test-drivers (set (keys cases))
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (let [{:keys [input-sql declared produced]} (get cases driver/*driver*)
            mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))
            transform-sql                 (str "SELECT id AS total FROM " schema "." table)]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp transform-sql)}
                        :target {:type "table" :schema schema :name "people_total" :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table {:schema schema :name table} :format :sql :sql input-sql}]
                        :expectations [{:type    :equals
                                        :name    "total"
                                        :format  :rows
                                        :columns [{:name "total" :cast_type declared}]
                                        :rows    [{"total" 1}]}]}]
          (let [result (transform-testing.runner/run-transform-test! transform-test)]
            (testing "the run passes, so nothing here reaches the author as a problem"
              (is (= :passed (:status result))))
            (testing "the transform's output column is not the type the author declared"
              (is (= produced (output-column-type!
                               driver/*driver*
                               (str "SELECT id AS total FROM (" input-sql ") mb_src"))))
              (is (not= declared produced)))
            (testing "and the run reports the output table's type, not the comparison's"
              (let [actual (-> result :expectations first :columns first :database_type)]
                (is (= produced actual))
                (is (not= declared actual))))))))))
