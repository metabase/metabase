(ns metabase-enterprise.dependencies.cards-reading-tables-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.jev.apps.saving :as jev.saving]
   [metabase.test :as mt]))

(deftest cards-reading-tables-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-temp [:model/Card {orders-sql :id}   {:dataset_query (mt/native-query {:query "SELECT count(*) FROM orders"})}
                   :model/Card {joined-sql :id}   {:dataset_query (mt/native-query
                                                                   {:query (str "SELECT p.category, count(*) FROM orders o "
                                                                                "JOIN products p ON o.product_id = p.id "
                                                                                "GROUP BY p.category")})}
                   :model/Card {people-mbql :id}  {:dataset_query (mt/mbql-query people {:aggregation [[:count]]})}]
      (deps.tu/synchronously-run-backfill!)
      (let [r (dependencies/cards-reading-tables #{(mt/id :orders) (mt/id :products)} 1000)]
        (testing "native cards are found through their parsed table dependencies"
          (is (= #{(mt/id :orders)} (get r orders-sql)))
          (is (= #{(mt/id :orders) (mt/id :products)} (get r joined-sql))))
        (testing "cards on other tables are not"
          (is (not (contains? r people-mbql)))))
      (testing "most shared tables first"
        (is (= joined-sql (ffirst (dependencies/cards-reading-tables #{(mt/id :orders) (mt/id :products)} 1))))))))

(deftest cards-reading-tables-requires-feature-test
  (mt/with-premium-features #{}
    (is (nil? (dependencies/cards-reading-tables #{(mt/id :orders)} 10)))))

(deftest jev-duplicate-candidates-native-test
  (testing "a native draft finds an existing native card on the same tables, even with an unrelated name"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:name          "Zebra"
                                                :dataset_query (mt/native-query
                                                                {:query (str "SELECT p.category, count(*) FROM orders o "
                                                                             "JOIN products p ON o.product_id = p.id "
                                                                             "GROUP BY p.category")})}]
        (deps.tu/synchronously-run-backfill!)
        (mt/with-current-user (mt/user->id :crowberto)
          (let [r (jev.saving/check {:dataset-query (mt/native-query
                                                     {:query (str "select category, count(*) from products "
                                                                  "join orders on orders.product_id = products.id "
                                                                  "group by category")})
                                     :name          "Order volume by product type"})]
            (is (= #{(mt/id :orders) (mt/id :products)}
                   (#'jev.saving/query-table-ids (#'jev.saving/->query (mt/native-query
                                                                        {:query "select * from products join orders on true"})))))
            (is (pos? (-> r :candidates :duplicate)))
            (is (some #{card-id}
                      (map :id (#'jev.saving/duplicate-candidates
                                {:table-ids   #{(mt/id :orders) (mt/id :products)}
                                 :text-tokens #{"order" "volume" "product" "type"}
                                 :summary     "Native SQL: select category"}))))))))))
