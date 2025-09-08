(ns ^:mb/driver-tests metabase-enterprise.transforms.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
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

(deftest basic-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                              {:database (mt/id),
                                               :type "query",
                                               :query {:source-table (mt/id :orders)}})]
      (is (= {t1 #{}}
             (ordering/transform-ordering (t2/select :model/Transform :id t1)))))))

(deftest dependency-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Table {table :id} {:schema "public"
                                             :name "orders_2"}
                   :model/Field _ {:table_id table
                                   :name "foo"}
                   :model/Transform {parent :id} (make-transform
                                                  {:database (mt/id),
                                                   :type "query",
                                                   :query {:source-table (mt/id :orders)}}
                                                  "orders_2")
                   :model/Transform {child :id} (make-transform
                                                 {:database (mt/id)
                                                  :type "query"
                                                  :query {:source-table table}}
                                                 "orders_3")]
      (is (= {parent #{}
              child #{parent}}
             (ordering/transform-ordering (t2/select :model/Transform :id [:in [parent child]])))))))

(defn- transform-deps-for-db [transform]
  (mt/with-metadata-provider (mt/id)
    (#'ordering/transform-deps transform)))

(deftest not-run-transform-dependency-ordering-test
  (mt/test-driver :postgres
    (testing "dependencies are correctly identified when no transforms have been run yet"
      (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM orders LIMIT 100"}}
                                                "orders_transform")
                     :model/Transform {t2 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM products LIMIT 100"}}
                                                "products_transform")
                     :model/Transform {t3 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM orders_transform ot
                                                                  LEFT JOIN products p
                                                                  ON ot.product_id = p.id
                                                                  LIMIT 100"}}
                                                "orders_transform_products")
                     :model/Transform {t4 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM orders_transform ot
                                                                  LEFT JOIN products_transform pt
                                                                  ON ot.product_id = pt.id
                                                                  LIMIT 100"}}
                                                "orders_transform_products_transform")]
        (is (= #{{:transform t1} {:transform t2}}
               (transform-deps-for-db (t2/select-one :model/Transform  t4))))
        (is (= {t1 #{}
                t2 #{}
                t3 #{t1}
                t4 #{t1 t2}}
               (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3 t4]]))))))
    (testing "dependencies are correctly identified when some transform have been run and some haven't"
      (mt/with-temp [:model/Transform {t1 :id :as transform1} (make-transform
                                                               {:database (mt/id),
                                                                :type :native,
                                                                :native {:query "SELECT * FROM checkins LIMIT 100"}}
                                                               "checkins_transform")
                     :model/Transform {t2 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM venues LIMIT 100"}}
                                                "venues_transform")
                     :model/Transform {t3 :id} (make-transform
                                                {:database (mt/id),
                                                 :type :native,
                                                 :native {:query "SELECT * FROM venues_transform vt
                                                                  LEFT JOIN checkins_transform ct
                                                                  ON vt.id = ct.venue_id
                                                                  LIMIT 100"}}
                                                "venues_transform_2")]
        (try
          (transforms.execute/run-mbql-transform! transform1 {:run-method :manual})
          (let [table1 (t2/select-one-pk :model/Table :name "checkins_transform")]
            (is (= #{{:table table1} {:transform t2}}
                   (transform-deps-for-db (t2/select-one :model/Transform  t3)))))
          (is (= {t1 #{}
                  t2 #{}
                  t3 #{t1 t2}}
                 (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]]))))
          (finally
            (t2/delete! :model/Table :name "checkins_transform")))))))

(deftest bigquery-native-transform-dependency-ordering-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [[dataset] (sql.tx/qualified-name-components :bigquery-cloud-sdk nil)]
      (testing "dependencies are correctly identified when some transform have been run and some haven't"
        (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                                  {:database (mt/id),
                                                   :type :native,
                                                   :native {:query (format "SELECT * FROM `%s.checkins` LIMIT 100" dataset)}}
                                                  "checkins_transform" dataset)
                       :model/Table {table1 :id} {:schema dataset
                                                  :name "checkins_transform"}
                       :model/Transform {t2 :id} (make-transform
                                                  {:database (mt/id),
                                                   :type :native,
                                                   :native {:query (format "SELECT * FROM `%s.venues` LIMIT 100" dataset)}}
                                                  "venues_transform" dataset)
                       :model/Transform {t3 :id} (make-transform
                                                  {:database (mt/id),
                                                   :type :native,
                                                   :native {:query (format "SELECT * FROM `%s.venues_transform` vt
                                                                            LEFT JOIN `%s.checkins_transform` ct
                                                                            ON vt.id = ct.venue_id
                                                                            LIMIT 100" dataset dataset)}}
                                                  "venues_transform_2" dataset)]
          (is (= #{{:table table1} {:transform t2}}
                 (transform-deps-for-db (t2/select-one :model/Transform  t3))))
          (is (= {t1 #{}
                  t2 #{}
                  t3 #{t1 t2}}
                 (ordering/transform-ordering (t2/select :model/Transform :id [:in [t1 t2 t3]])))))))))

(deftest basic-dependencies-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:database (mt/id),
                                             :type "query",
                                             :query {:source-table (mt/id :orders)}})]
    (is (= #{{:table (mt/id :orders)}}
           (transform-deps-for-db (t2/select-one :model/Transform :id t1))))))

(deftest joined-dependencies-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:database (mt/id),
                                             :type "query",
                                             :query {:source-table (mt/id :orders),
                                                     :joins
                                                     [{:fields "all",
                                                       :strategy "left-join",
                                                       :alias "Products",
                                                       :condition
                                                       [:=
                                                        [:field
                                                         (mt/id :orders :product_id)
                                                         {:base-type "type/Integer"}]
                                                        [:field
                                                         (mt/id :products :id)
                                                         {:base-type "type/Integer",
                                                          :join-alias "Products"}]],
                                                       :source-table (mt/id :products)}]},
                                             :parameters []})]
    (is (= #{{:table (mt/id :orders)}
             {:table (mt/id :products)}}
           (transform-deps-for-db (t2/select-one :model/Transform :id t1))))))

(deftest card-dependencies-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:transforms/table :left-join]})
    (mt/with-temp [:model/Card {card :id} {:dataset_query {:database (mt/id),
                                                           :type "query",
                                                           :query {:source-table (mt/id :orders),
                                                                   :joins
                                                                   [{:fields "all",
                                                                     :strategy "left-join",
                                                                     :alias "Products",
                                                                     :condition
                                                                     [:=
                                                                      [:field
                                                                       (mt/id :orders :product_id)
                                                                       {:base-type "type/Integer"}]
                                                                      [:field
                                                                       (mt/id :products :id)
                                                                       {:base-type "type/Integer",
                                                                        :join-alias "Products"}]],
                                                                     :source-table (mt/id :products)}]},
                                                           :parameters []}}
                   :model/Transform {t1 :id} (make-transform
                                              {:database (mt/id),
                                               :type "query",
                                               :query
                                               {:aggregation [["count"]],
                                                :breakout [["field" "Products__category" {:base-type "type/Text"}]],
                                                :source-table (str "card__" card)},
                                               :parameters []})]
      (is (= #{{:table (mt/id :orders)}
               {:table (mt/id :products)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest native-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                              {:database (mt/id),
                                               :type :native
                                               :native (qp.compile/compile
                                                        {:database (mt/id),
                                                         :type "query",
                                                         :query {:source-table (mt/id :orders)}})})]
      (is (= #{{:table (mt/id :orders)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest native-card-dependencies-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:transforms/table
                                                         :native-parameter-card-reference
                                                         :left-join]})
    (mt/with-temp [:model/Card {card :id} {:dataset_query {:database (mt/id),
                                                           :type "query",
                                                           :query {:source-table (mt/id :orders),
                                                                   :joins
                                                                   [{:fields "all",
                                                                     :strategy "left-join",
                                                                     :alias "Products",
                                                                     :condition
                                                                     [:=
                                                                      [:field
                                                                       (mt/id :orders :product_id)
                                                                       {:base-type "type/Integer"}]
                                                                      [:field
                                                                       (mt/id :products :id)
                                                                       {:base-type "type/Integer",
                                                                        :join-alias "Products"}]],
                                                                     :source-table (mt/id :products)}]},
                                                           :parameters []}}
                   :model/Transform {t1 :id} (make-transform
                                              {:database (mt/id),
                                               :type :native,
                                               :native {:query
                                                        (mt/native-query-with-card-template-tag
                                                         (:engine (mt/db))
                                                         (str "#" card)),
                                                        :template-tags
                                                        {(keyword (str "#" card))
                                                         {:type "card"
                                                          :name "card"
                                                          :display-name "card"
                                                          :card-id card}}}})]
      (is (= #{{:table (mt/id :orders)}
               {:table (mt/id :products)}}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(defn- rotations
  [v]
  (let [n (count v)
        elements (cycle v)]
    (into #{} (map #(take n (drop % elements)))
          (range n))))

(deftest find-cycle-test
  (let [test-graph
        {1 #{2}
         2 #{3 5}
         3 #{4}
         4 #{6}
         5 #{6}
         6 #{7}
         7 #{3}}
        cycles (rotations [3 4 6 7])]
    (is (contains? cycles
                   (ordering/find-cycle test-graph)))))

(deftest get-transform-cycle-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "cycle is detected in transform referencing itself"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name "table_1"}
                     :model/Field _ {:table_id table1
                                     :name "foo"}
                     :model/Transform {t1 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table1}}
                                                "table_1")]
        (is (= {:cycle-str "transform_table_1"
                :cycle [t1]}
               (ordering/get-transform-cycle (t2/select-one :model/Transform :id t1))))))
    (testing "cycle is caught in 2 transforms referencing each other"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name "table_1"}
                     :model/Field _ {:table_id table1
                                     :name "foo"}
                     :model/Table {table2 :id} {:schema "public"
                                                :name "table_2"}
                     :model/Field _ {:table_id table2
                                     :name "foo"}
                     :model/Transform {t1 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table1}}
                                                "table_2")
                     :model/Transform {t2 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table2}}
                                                "table_1")]
        (is (= {:cycle-str "transform_table_2 -> transform_table_1",
                :cycle [t1 t2]}
               (ordering/get-transform-cycle (t2/select-one :model/Transform :id t1))))))
    (testing "cycle is detected in 3 transforms referencing each other"
      (mt/with-temp [:model/Table {table1 :id} {:schema "public"
                                                :name "table_1"}
                     :model/Field _ {:table_id table1
                                     :name "foo"}
                     :model/Table {table2 :id} {:schema "public"
                                                :name "table_2"}
                     :model/Field _ {:table_id table2
                                     :name "foo"}
                     :model/Table {table3 :id} {:schema "public"
                                                :name "table_3"}
                     :model/Field _ {:table_id table3
                                     :name "foo"}
                     :model/Transform {t1 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table1}}
                                                "table_2")
                     :model/Transform {t2 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table2}}
                                                "table_3")
                     :model/Transform {t3 :id} (make-transform
                                                {:database (mt/id),
                                                 :type "query",
                                                 :query {:source-table table3}}
                                                "table_1")]
        (is (= {:cycle-str "transform_table_2 -> transform_table_1 -> transform_table_3",
                :cycle [t1 t3 t2]}
               (ordering/get-transform-cycle (t2/select-one :model/Transform :id t1))))))))
