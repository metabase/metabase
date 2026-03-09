(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.transforms.test-util :as transforms.tu]
   [toucan2.core :as t2]))

(defn- make-transform [query & [name schema]]
  (let [name (or name (mt/random-name))
        schema (or schema (transforms.tu/default-schema-or-public))]
    {:source {:type :query
              :query query}
     :name (str "transform_" name)
     :target {:schema schema
              :name name
              :type :table}}))

(defn- make-python-transform [source-tables & [name schema target-db]]
  (let [name (or name (mt/random-name))
        schema (or schema (transforms.tu/default-schema-or-public))
        target-db (or target-db (mt/id))]
    {:source {:type "python"
              :source-tables source-tables
              :body "# Python code here\nresult = df"}
     :name (str "python_transform_" name)
     :source_database_id (mt/id)
     :target {:database target-db
              :schema schema
              :name name
              :type "table"}}))

(defn- transform-deps-for-db [transform]
  (mt/with-metadata-provider (mt/id)
    (transforms-base.i/table-dependencies transform)))

(deftest python-transform-basic-dependencies-test
  (testing "Python transforms with source-tables dependencies are extracted correctly"
    (mt/with-temp [:model/Transform {t1 :id} (make-python-transform [(transforms.tu/source-table-entry "orders" (mt/id :orders))
                                                                     (transforms.tu/source-table-entry "products" (mt/id :products))])]
      (is (= #{{:table (mt/id :orders)}
               {:table (mt/id :products)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest python-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms are ordered correctly based on source-tables dependencies"
      (let [schema (transforms.tu/default-schema-or-public)]
        ;; t1's after-insert creates a provisional table for "output_1"; look it up for t2's source-tables
        (mt/with-temp [:model/Transform {t1 :id} (make-python-transform [{:alias "orders" :table_id (mt/id :orders)}] "output_1")]
          (let [table1 (t2/select-one-pk :model/Table :db_id (mt/id) :schema schema :name "output_1")]
            (mt/with-temp [:model/Transform {t2 :id} (make-python-transform [{:alias "output_1" :table_id table1}] "output_2")]
              (is (= {t1 #{}
                      t2 #{t1}}
                     (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2]])))))))))))

(deftest python-transform-multiple-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms with multiple table dependencies"
      (let [schema (transforms.tu/default-schema-or-public)]
        ;; t1 and t2's after-insert hooks create provisional tables; look them up for t3's source-tables
        (mt/with-temp [:model/Transform {t1 :id} (make-python-transform [{:alias "orders" :table_id (mt/id :orders)}] "output_1")
                       :model/Transform {t2 :id} (make-python-transform [{:alias "products" :table_id (mt/id :products)}] "output_2")]
          (let [table1 (t2/select-one-pk :model/Table :db_id (mt/id) :schema schema :name "output_1")
                table2 (t2/select-one-pk :model/Table :db_id (mt/id) :schema schema :name "output_2")]
            (mt/with-temp [:model/Transform {t3 :id} (make-python-transform [{:alias "output_1" :table_id table1}
                                                                             {:alias "output_2" :table_id table2}] "final_output")]
              (is (= {t1 #{}
                      t2 #{}
                      t3 #{t1 t2}}
                     (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]])))))))))))

(deftest mixed-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python :transforms/table)
    (testing "Python and query transforms are ordered together correctly"
      (let [schema (transforms.tu/default-schema-or-public)]
        ;; Each transform's after-insert creates a provisional table for its target
        (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                                   {:database (mt/id),
                                                    :type "query",
                                                    :query {:source-table (mt/id :orders)}}
                                                   "sql_output")]
          (let [table1 (t2/select-one-pk :model/Table :db_id (mt/id) :schema schema :name "sql_output")]
            (mt/with-temp [:model/Transform {t2 :id} (make-python-transform [{:alias "sql_output" :table_id table1}] "python_output")]
              (let [table2 (t2/select-one-pk :model/Table :db_id (mt/id) :schema schema :name "python_output")]
                (mt/with-temp [:model/Transform {t3 :id} (make-transform
                                                           {:database (mt/id)
                                                            :type "query"
                                                            :query {:source-table table2}}
                                                           "final_output")]
                  (is (= {t1 #{}
                          t2 #{t1}
                          t3 #{t2}}
                         (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]])))))))))))))
