(ns ^:mb/driver-tests metabase-enterprise.transforms.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- make-transform [{:keys [query name]}]
  {:source {:type "query",
            :query query}
   :name "transform1"
   :target {:schema "public"
            :name (or name "orders_2")
            :type "table"}})

(deftest basic-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                              {:query {:database (mt/id),
                                                       :type "query",
                                                       :query {:source-table (mt/id :orders)}}})]
      (is (= {t1 #{}}
             (ordering/transform-ordering (t2/select :model/Transform :id t1)))))))

(deftest dependency-ordering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Table {table :id} {:schema "public"
                                             :name "orders_2"}
                   :model/Field _ {:table_id table
                                   :name "foo"}
                   :model/Transform {parent :id} (make-transform
                                                  {:query {:database (mt/id),
                                                           :type "query",
                                                           :query {:source-table (mt/id :orders)}}})
                   :model/Transform {child :id} (make-transform
                                                 {:query {:database (mt/id)
                                                          :type "query"
                                                          :query {:source-table table}}
                                                  :name "orders_3"})]
      (is (= {parent #{}
              child #{parent}}
             (ordering/transform-ordering (t2/select :model/Transform :id [:in [parent child]])))))))

(defn- transform-deps-for-db [transform]
  (mt/with-metadata-provider (mt/id)
    (#'ordering/transform-deps transform)))

(deftest basic-dependencies-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:query {:database (mt/id),
                                                     :type "query",
                                                     :query {:source-table (mt/id :orders)}}})]
    (is (= #{(mt/id :orders)}
           (transform-deps-for-db (t2/select-one :model/Transform :id t1))))))

(deftest joined-dependencies-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:query {:database (mt/id),
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
                                                     :parameters []}})]
    (is (= #{(mt/id :orders)
             (mt/id :products)}
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
                                              {:query {:database (mt/id),
                                                       :type "query",
                                                       :query
                                                       {:aggregation [["count"]],
                                                        :breakout [["field" "Products__category" {:base-type "type/Text"}]],
                                                        :source-table (str "card__" card)},
                                                       :parameters []}})]
      (is (= #{(mt/id :orders)
               (mt/id :products)}
             (transform-deps-for-db (t2/select-one :model/Transform :id t1)))))))

(deftest native-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                              {:query {:database (mt/id),
                                                       :type :native
                                                       :native (qp.compile/compile
                                                                {:database (mt/id),
                                                                 :type "query",
                                                                 :query {:source-table (mt/id :orders)}})}})]
      (is (= #{(mt/id :orders)}
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
                                              {:query {:database (mt/id),
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
                                                                  :card-id card}}}}})]
      (is (= #{(mt/id :orders)
               (mt/id :products)}
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
