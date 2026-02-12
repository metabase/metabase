(ns metabase-enterprise.transforms.ordering-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.test :as mt]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.ordering :as ordering]
   [toucan2.core :as t2]))

(defn- make-python-transform
  "Create a python transform definition with the given source-tables and target name."
  [source-tables target-name & [target-schema]]
  (let [default-schema "public"
        schema (or target-schema default-schema)]
    {:source {:type "python"
              :source-database (mt/id)
              :source-tables source-tables
              :body "df.write_output()"}
     :name (str "transform_" target-name)
     :target {:database (mt/id)
              :schema schema
              :name target-name
              :type "table"}}))

(deftest python-transform-table-ref-ordering-test
  (testing "Python transform with name-based source table ref resolves to producing transform"
    (mt/with-temp [;; Transform A produces table "intermediate_output"
                   :model/Transform {t-a :id} (make-python-transform
                                               {"input" (mt/id :orders)}
                                               "intermediate_output")
                   ;; Transform B references intermediate_output by name (table doesn't exist yet)
                   :model/Transform {t-b :id} (make-python-transform
                                               {"source" {:database_id (mt/id)
                                                          :schema "public"
                                                          :table "intermediate_output"}}
                                               "final_output")]
      (testing "table-dependencies returns table-ref for unresolved name reference"
        (let [deps (transforms.i/table-dependencies (t2/select-one :model/Transform :id t-b))]
          (is (contains? deps {:table-ref {:database_id (mt/id)
                                           :schema "public"
                                           :table "intermediate_output"}}))))

      (testing "transform-ordering correctly resolves the dependency"
        (is (= {t-a #{}
                t-b #{t-a}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t-a t-b]]))))))))

(deftest python-transform-mixed-source-tables-test
  (testing "Python transform with mixed int and name-based refs"
    (mt/with-temp [:model/Transform {t-a :id} (make-python-transform
                                               {"input" (mt/id :orders)}
                                               "output_a")
                   :model/Transform {t-b :id} (make-python-transform
                                               {;; Direct table reference (existing table)
                                                "existing" (mt/id :products)
                                                ;; Name-based reference (table doesn't exist yet)
                                                "from_transform" {:database_id (mt/id)
                                                                  :schema "public"
                                                                  :table "output_a"}}
                                               "output_b")]
      (testing "table-dependencies includes both types"
        (let [deps (transforms.i/table-dependencies (t2/select-one :model/Transform :id t-b))]
          (is (contains? deps {:table (mt/id :products)}))
          (is (contains? deps {:table-ref {:database_id (mt/id)
                                           :schema "public"
                                           :table "output_a"}}))))

      (testing "transform-ordering resolves both dependencies"
        (is (= {t-a #{}
                t-b #{t-a}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t-a t-b]]))))))))
