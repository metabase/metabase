(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- make-transform [query & [name schema]]
  (let [name (or name (mt/random-name))
        default-schema (some-> driver/*driver* driver.sql/default-schema)
        schema (or schema default-schema "public")]
    {:source {:type :query
              :query query}
     :name (str "transform_" name)
     :target {:schema schema
              :name name
              :type :table}}))

(defn- make-python-transform [source-tables & [name schema target-db]]
  (let [name (or name (mt/random-name))
        default-schema (some-> driver/*driver* driver.sql/default-schema)
        schema (or schema default-schema "public")
        target-db (or target-db (mt/id))]
    {:source {:type "python"
              :source-tables source-tables
              :body "# Python code here\nresult = df"}
     :name (str "python_transform_" name)
     :target {:database target-db
              :schema schema
              :name name
              :type "table"}}))

(defn- transform-deps-for-db [transform]
  (mt/with-metadata-provider (mt/id)
    (#'ordering/transform-deps transform)))

(deftest python-transform-basic-dependencies-test
  (testing "Python transforms with source-tables dependencies are extracted correctly"
    (mt/with-temp [:model/Transform {t1 :id} (make-python-transform {"orders"   (mt/id :orders)
                                                                     "products" (mt/id :products)})]
      (is (= #{{:table (mt/id :orders)}
               {:table (mt/id :products)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest python-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms are ordered correctly based on source-tables dependencies"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name   "output_1"}
                     :model/Field _ {:table_id table1
                                     :name     "foo"}
                     :model/Transform {t1 :id} (make-python-transform {"orders" (mt/id :orders)} "output_1")
                     :model/Transform {t2 :id} (make-python-transform {"output_1" table1} "output_2")]
        (is (= {t1 #{}
                t2 #{t1}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2]]))))))))

(deftest python-transform-multiple-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (testing "Python transforms with multiple table dependencies"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name "output_1"}
                     :model/Field _ {:table_id table1
                                     :name "foo"}
                     :model/Table {table2 :id} {:schema "public"
                                                :name "output_2"}
                     :model/Field _ {:table_id table2
                                     :name "bar"}
                     :model/Transform {t1 :id} (make-python-transform {"orders" (mt/id :orders)} "output_1")
                     :model/Transform {t2 :id} (make-python-transform {"products" (mt/id :products)} "output_2")
                     :model/Transform {t3 :id} (make-python-transform {"output_1" table1
                                                                       "output_2" table2} "final_output")]
        (is (= {t1 #{}
                t2 #{}
                t3 #{t1 t2}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]]))))))))

(deftest mixed-transform-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python :transforms/table)
    (testing "Python and query transforms are ordered together correctly"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name "sql_output"}
                     :model/Field _ {:table_id table1
                                     :name "foo"}
                     :model/Table {table2 :id} {:schema "public"
                                                :name "python_output"}
                     :model/Field _ {:table_id table2
                                     :name "bar"}
                     ;; SQL transform that depends on orders table
                     :model/Transform {t1 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table (mt/id :orders)}}
                                                "sql_output")
                     ;; Python transform that depends on the SQL transform's output
                     :model/Transform {t2 :id} (make-python-transform {"sql_output" table1} "python_output")
                     ;; Another SQL transform that depends on the Python transform's output
                     :model/Transform {t3 :id} (make-transform
                                                {:database (mt/id)
                                                 :type "query"
                                                 :query {:source-table table2}}
                                                "final_output")]
        (is (= {t1 #{}
                t2 #{t1}
                t3 #{t2}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]]))))))))
