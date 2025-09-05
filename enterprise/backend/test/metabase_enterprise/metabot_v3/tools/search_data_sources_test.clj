(ns metabase-enterprise.metabot-v3.tools.search-data-sources-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.search-data-sources :as sds]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.test :as mt]))

(deftest transform-search-result-test
  (testing "table result transformation"
    (let [result {:model "table"
                  :id 1
                  :table_name "orders"
                  :name "Orders"
                  :description "Order table"
                  :database_id 42
                  :table_schema "public"}
          expected {:id 1
                    :type :table
                    :name "orders"
                    :display_name "Orders"
                    :description "Order table"
                    :database_id 42
                    :database_schema "public"}]
      (is (= expected (sds/transform-search-result result)))))

  (testing "model result transformation"
    (let [result {:model "dataset"
                  :id 2
                  :name "Sales Model"
                  :description "Model for sales"
                  :database_id 43
                  :verified true}
          expected {:id 2
                    :type :model
                    :name "Sales Model"
                    :display_name "Sales Model"
                    :description "Model for sales"
                    :database_id 43
                    :verified true}]
      (is (= expected (sds/transform-search-result result)))))

  (testing "dashboard result transformation"
    (let [result {:model "dashboard"
                  :id 3
                  :name "Main Dashboard"
                  :description "Dashboard desc"
                  :verified false}
          expected {:id 3
                    :type :dashboard
                    :name "Main Dashboard"
                    :description "Dashboard desc"
                    :verified false}]
      (is (= expected (sds/transform-search-result result)))))

  (testing "question result transformation with moderated_status"
    (let [result {:model "card"
                  :id 4
                  :name "Q1"
                  :description "Question desc"
                  :moderated_status "verified"}
          expected {:id 4
                    :type :question
                    :name "Q1"
                    :description "Question desc"
                    :verified true}]
      (is (= expected (sds/transform-search-result result)))))

  (testing "metric result transformation"
    (let [result {:model "metric"
                  :id 5
                  :name "Revenue"
                  :description "Metric desc"
                  :verified nil}
          expected {:id 5
                    :type :metric
                    :name "Revenue"
                    :description "Metric desc"
                    :verified false}]
      (is (= expected (sds/transform-search-result result))))))

(deftest search-data-sources-test
  (mt/with-test-user :rasta
    (mt/with-premium-features #{:content-verification}
      (let [order-table {:id 1
                         :model "table"
                         :table_name "orders"
                         :name "Orders"
                         :description "Order table"
                         :database_id 42
                         :table_schema "public"}
            dashboard {:id 2
                       :model "dashboard"
                       :name "Sales Dashboard"
                       :description "Dashboard for sales"
                       :verified true}]

        (with-redefs [perms/impersonated-user? (fn [] false)
                      perms/sandboxed-user? (fn [] false)
                      api/*current-user-id* 1]
          (testing "search-data-sources returns transformed and deduplicated results for multiple keywords"
            (with-redefs [search/search (fn [_] {:data [order-table]})]
              (let [args {:keywords ["orders" "sales"]
                          :entity-types ["table"]}
                    results (sds/search-data-sources args)
                    expected [(sds/transform-search-result order-table)]]
                (is (= expected results)))))

          (testing "search-data-sources handles multiple results and deduplication"
            (with-redefs [search/search (fn [_] {:data [order-table
                                                        order-table
                                                        dashboard]})]
              (let [args {:keywords ["orders"]
                          :entity-types ["table" "dashboard"]}
                    results (sds/search-data-sources args)
                    expected [(sds/transform-search-result order-table)
                              (sds/transform-search-result dashboard)]]
                (is (= expected results)))))

          (testing "search-data-sources handles empty results"
            (with-redefs [search/search (fn [_] {:data []})]
              (let [args {:keywords ["none"]
                          :entity-types ["table"]}
                    results (sds/search-data-sources args)]
                (is (empty? results))))))))))
