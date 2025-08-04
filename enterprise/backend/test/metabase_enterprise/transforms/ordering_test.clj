(ns metabase-enterprise.transforms.ordering-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- make-transform [{:keys [query]}]
  {:source {:type "query",
            :query query}
   :name "transform1"
   :target {:schema "public"
            :name "orders_2"
            :type "table"}})

(deftest basic-ordering-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:query {:database (mt/id),
                                                     :type "query",
                                                     :query {:source-table (mt/id :orders)}}})]
    (is (= {t1 #{}}
           (ordering/transform-ordering [(t2/select-one :model/Transform :id t1)])))))

(deftest basic-dependencies-test
  (mt/with-temp [:model/Transform {t1 :id} (make-transform
                                            {:database (mt/id),
                                             :type "query",
                                             :query {:source-table (mt/id :orders)}})]
    (is (= #{(mt/id :orders)}
           (#'ordering/transform-deps (t2/select-one :model/Transform :id t1))))))

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
    (is (= #{(mt/id :orders)
             (mt/id :products)}
           (into #{}
                 (#'ordering/transform-deps (t2/select-one :model/Transform :id t1)))))))

(deftest card-dependencies-test
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
    (is (= #{(mt/id :orders)
             (mt/id :products)}
           (into #{}
                 (#'ordering/transform-deps (t2/select-one :model/Transform :id t1)))))))

(defn- rotations
  [v]
  (let [n (count v)]
    (into #{} (map #(take n (drop % (cycle v))))
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
