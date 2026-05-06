(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.transforms.test-util :as transforms.tu]
   [metabase.warehouse-schema.models.table :as ws.table]
   [toucan2.core :as t2]))

(defn- sql-tx [query & [name schema]]
  (let [name (or name (mt/random-name))
        schema (or schema (transforms.tu/default-schema-or-public))]
    {:source {:type :query
              :query query}
     :name (str "transform_" name)
     :target {:schema schema
              :name name
              :type :table}}))

(defn- py-tx [source-tables & [name schema target-db]]
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
    (mt/with-temp [:model/Transform {t1 :id} (py-tx [(transforms.tu/source-table-entry "orders" (mt/id :orders))
                                                     (transforms.tu/source-table-entry "products" (mt/id :products))])]
      (is (= #{{:table (mt/id :orders)}
               {:table (mt/id :products)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest python-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms are ordered correctly based on source-tables dependencies"
      (let [schema (transforms.tu/default-schema-or-public)]
        (ws.table/gc-transform-target-tables!)
        (mt/with-temp [:model/Table     {table1 :id} {:schema schema    :name "output_1"}
                       :model/Field     _            {:table_id table1  :name "foo"}
                       :model/Transform {t1 :id}     (py-tx [(transforms.tu/source-table-entry "orders" (mt/id :orders))] "output_1")
                       :model/Transform {t2 :id}     (py-tx [(transforms.tu/source-table-entry "output_1" table1)] "output_2")]
          (is (= {t1 #{}
                  t2 #{t1}}
                 (:dependencies (ordering/transform-ordering #{t1 t2} (t2/select :model/Transform :id [:in [t1 t2]]))))))))))

(deftest python-transform-multiple-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms with multiple table dependencies"
      (let [schema (transforms.tu/default-schema-or-public)]
        (ws.table/gc-transform-target-tables!)
        (mt/with-temp [:model/Table     {table1 :id} {:schema   schema  :name "output_1"}
                       :model/Field     _            {:table_id table1  :name "foo"}
                       :model/Table     {table2 :id} {:schema   schema  :name "output_2"}
                       :model/Field     _            {:table_id table2  :name "bar"}
                       :model/Transform {t1 :id}     (py-tx [(transforms.tu/source-table-entry "orders" (mt/id :orders))]     "output_1")
                       :model/Transform {t2 :id}     (py-tx [(transforms.tu/source-table-entry "products" (mt/id :products))] "output_2")
                       :model/Transform {t3 :id}     (py-tx [(transforms.tu/source-table-entry "output_1" table1)
                                                             (transforms.tu/source-table-entry "output_2" table2)]             "final_output")]
          (is (= {t1 #{}
                  t2 #{}
                  t3 #{t1 t2}}
                 (:dependencies (ordering/transform-ordering #{t1 t2 t3} (t2/select :model/Transform :id [:in [t1 t2 t3]]))))))))))

(deftest mixed-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python :transforms/table)
    (testing "Python and query transforms are ordered together correctly"
      (let [schema (transforms.tu/default-schema-or-public)]
        (ws.table/gc-transform-target-tables!)
        (mt/with-temp [:model/Table     {table1 :id} {:schema   schema  :name "sql_output"}
                       :model/Field     _            {:table_id table1  :name "foo"}
                       :model/Table     {table2 :id} {:schema   schema  :name "python_output"}
                       :model/Field     _            {:table_id table2  :name "bar"}
                       ;; SQL transform that depends on orders table
                       :model/Transform {t1 :id}     (sql-tx {:database (mt/id)
                                                              :type     "query"
                                                              :query    {:source-table (mt/id :orders)}}
                                                             "sql_output")
                       ;; Python transform that depends on the SQL transform's output
                       :model/Transform {t2 :id}     (py-tx [(transforms.tu/source-table-entry "sql_output" table1)] "python_output")
                       ;; Another SQL transform that depends on the Python transform's output
                       :model/Transform {t3 :id}     (sql-tx {:database (mt/id)
                                                              :type     "query"
                                                              :query    {:source-table table2}}      "final_output")]
          (is (= {t1 #{}
                  t2 #{t1}
                  t3 #{t2}}
                 (:dependencies (ordering/transform-ordering #{t1 t2 t3} (t2/select :model/Transform :id [:in [t1 t2 t3]]))))))))))
