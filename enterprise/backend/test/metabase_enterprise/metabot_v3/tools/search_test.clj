(ns metabase-enterprise.metabot-v3.tools.search-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.search :as search]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search-core]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest reciprocal-rank-fusion-test
  (testing "Basic RRF with single list"
    (let [single-list [[{:id 1 :model "card" :name "Card 1"}
                        {:id 2 :model "dashboard" :name "Dashboard 1"}
                        {:id 3 :model "table" :name "Table 1"}]]
          result (#'search/reciprocal-rank-fusion single-list)]
      (is (= 3 (count result)))
      (is (= 1 (-> result first :id)))
      (is (= 2 (-> result second :id)))
      (is (= 3 (-> result last :id)))))

  (testing "RRF with multiple lists - no overlap"
    (let [list1 [{:id 1 :model "card" :name "Card 1"}
                 {:id 2 :model "dashboard" :name "Dashboard 1"}]
          list2 [{:id 3 :model "table" :name "Table 1"}
                 {:id 4 :model "metric" :name "Metric 1"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 4 (count result)))
      (is (every? #(contains? #{1 2 3 4} (:id %)) result))))

  (testing "RRF with overlapping results - should boost common items"
    (let [list1 [{:id 1 :model "card" :name "Revenue Report"}
                 {:id 2 :model "dashboard" :name "Sales Dashboard"}
                 {:id 3 :model "table" :name "Orders"}]
          list2 [{:id 2 :model "dashboard" :name "Sales Dashboard"}
                 {:id 1 :model "card" :name "Revenue Report"}
                 {:id 4 :model "metric" :name "Total Revenue"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 4 (count result)))
      ;; Items appearing in both lists should rank higher
      (let [top-two-ids (set (map :id (take 2 result)))]
        (is (contains? top-two-ids 1))
        (is (contains? top-two-ids 2)))))

  (testing "RRF with identical items at different positions"
    (let [list1 [{:id 1 :model "card" :name "First"}
                 {:id 2 :model "dashboard" :name "Second"}
                 {:id 3 :model "table" :name "Third"}]
          list2 [{:id 3 :model "table" :name "Third"}
                 {:id 2 :model "dashboard" :name "Second"}
                 {:id 1 :model "card" :name "First"}]
          list3 [{:id 2 :model "dashboard" :name "Second"}
                 {:id 3 :model "table" :name "Third"}
                 {:id 1 :model "card" :name "First"}]
          result (#'search/reciprocal-rank-fusion [list1 list2 list3])]
      (is (= 3 (count result)))
      ;; Item 2 appears first in list3, second in list1 and list2, so should rank highest
      (is (= 2 (-> result first :id)))))

  (testing "RRF with empty lists"
    (let [list1 []
          list2 [{:id 1 :model "card" :name "Card 1"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 1 (count result)))
      (is (= 1 (-> result first :id)))))

  (testing "RRF with all empty lists"
    (let [result (#'search/reciprocal-rank-fusion [[] [] []])]
      (is (empty? result))))

  (testing "RRF score calculation correctness"
    ;; Test that the RRF formula 1/(k+r) where k=60 is correctly applied
    (let [list1 [{:id 1 :model "card" :name "Rank 1"}]  ; rank=1, score=1/61
          list2 [{:id 2 :model "dashboard" :name "Other"}
                 {:id 1 :model "card" :name "Rank 1"}]  ; rank=2, score=1/62
          result (#'search/reciprocal-rank-fusion [list1 list2])
          first-item (first result)
          second-item (second result)]
      ;; Item 1 appears at rank 1 in list1 (score=1/61) and rank 2 in list2 (score=1/62)
      ;; Total score = 1/61 + 1/62 ≈ 0.0164 + 0.0161 = 0.0325
      ;; Item 2 appears only at rank 1 in list2 (score=1/61 ≈ 0.0164)
      ;; So item 1 should rank higher than item 2
      (is (= 1 (:id first-item)))
      (is (= 2 (:id second-item)))))

  (testing "RRF preserves item data"
    (let [complex-item {:id 42
                        :model "dataset"
                        :name "Complex Dataset"
                        :description "A detailed description"
                        :database_id 1
                        :created_at "2024-01-01"
                        :extra_field "preserved"}
          result (#'search/reciprocal-rank-fusion [[complex-item]])]
      (is (= 1 (count result)))
      (is (= complex-item (first result)))))

  (testing "RRF with many lists"
    (let [lists (for [i (range 5)]
                  [{:id (inc i) :model "card" :name (str "Card " (inc i))}
                   {:id 99 :model "dashboard" :name "Common Dashboard"}
                   {:id (+ i 10) :model "table" :name (str "Table " (+ i 10))}])
          result (#'search/reciprocal-rank-fusion lists)]
      ;; Item 99 appears in all 5 lists at position 2, so should rank very high
      (is (= 99 (:id (first result)))))))

(deftest postprocess-search-result-test
  (testing "table result postprocessing"
    (let [result {:model "table"
                  :id 1
                  :table_name "orders"
                  :name "Orders"
                  :description "Order table"
                  :database_id 42
                  :table_schema "public"
                  :updated_at "2024-01-01"
                  :created_at "2024-01-01"}
          expected {:id 1
                    :type "table"
                    :name "orders"
                    :display_name "Orders"
                    :description "Order table"
                    :database_id 42
                    :database_schema "public"
                    :updated_at "2024-01-01"
                    :created_at "2024-01-01"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "model (dataset) result postprocessing"
    (let [result {:model "dataset"
                  :id 2
                  :name "Sales Model"
                  :description "Model for sales"
                  :database_id 43
                  :verified true
                  :collection nil
                  :updated_at "2024-01-02"
                  :created_at "2024-01-02"}
          expected {:id 2
                    :type "model"
                    :name "Sales Model"
                    :description "Model for sales"
                    :database_id 43
                    :verified true
                    :collection {}
                    :updated_at "2024-01-02"
                    :created_at "2024-01-02"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "transform result postprocessing"
    (let [result {:model "transform"
                  :id 3
                  :name "User Transform"
                  :description "Transform for users"
                  :database_id 44
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}
          expected {:id 3
                    :type "transform"
                    :name "User Transform"
                    :description "Transform for users"
                    :database_id 44
                    :updated_at "2024-01-03"
                    :created_at "2024-01-03"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "dashboard result postprocessing"
    (let [result {:model "dashboard"
                  :id 3
                  :name "Main Dashboard"
                  :description "Dashboard desc"
                  :verified false
                  :collection {:name "Finance" :authority_level "official"}
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}
          expected {:id 3
                    :type "dashboard"
                    :name "Main Dashboard"
                    :description "Dashboard desc"
                    :verified false
                    :collection {:name "Finance" :authority_level "official"}
                    :updated_at "2024-01-03"
                    :created_at "2024-01-03"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "question (card) result postprocessing with moderated_status"
    (let [result {:model "card"
                  :id 4
                  :name "Q1"
                  :description "Question desc"
                  :moderated_status "verified"
                  :collection {:name "Analytics" :authority_level nil}
                  :updated_at "2024-01-04"
                  :created_at "2024-01-04"}
          expected {:id 4
                    :type "question"
                    :name "Q1"
                    :description "Question desc"
                    :database_id nil
                    :verified true
                    :collection {:name "Analytics" :authority_level nil}
                    :updated_at "2024-01-04"
                    :created_at "2024-01-04"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "metric result postprocessing"
    (let [result {:model "metric"
                  :id 5
                  :name "Revenue"
                  :description "Metric desc"
                  :verified nil
                  :updated_at "2024-01-05"
                  :created_at "2024-01-05"}
          expected {:id 5
                    :type "metric"
                    :name "Revenue"
                    :description "Metric desc"
                    :database_id nil
                    :verified false
                    :collection {}
                    :updated_at "2024-01-05"
                    :created_at "2024-01-05"}]
      (is (= expected (#'search/postprocess-search-result result)))))

  (testing "database result postprocessing"
    (let [result {:model "database"
                  :id 6
                  :name "Production DB"
                  :description "Main database"
                  :updated_at "2024-01-06"
                  :created_at "2024-01-06"}
          expected {:id 6
                    :type "database"
                    :name "Production DB"
                    :description "Main database"
                    :updated_at "2024-01-06"
                    :created_at "2024-01-06"}]
      (is (= expected (#'search/postprocess-search-result result))))))

(deftest search-test
  (mt/with-premium-features #{:content-verification}
    (mt/with-test-user :rasta
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

          (testing "search returns postprocessed results for term queries"
            (with-redefs [search-core/search (fn [_] {:data [order-table]})]
              (let [args {:term-queries ["orders"]
                          :entity-types ["table"]}
                    results (search/search args)
                    expected [(#'search/postprocess-search-result order-table)]]
                (is (= expected results)))))

          (testing "search returns postprocessed results for semantic queries"
            (with-redefs [search-core/search (fn [_] {:data [dashboard]})]
              (let [args {:semantic-queries ["sales metrics"]
                          :entity-types ["dashboard"]}
                    results (search/search args)
                    expected [(#'search/postprocess-search-result dashboard)]]
                (is (= expected results)))))

          (testing "search combines term and semantic queries using RRF"
            (with-redefs [search-core/search (fn [context]
                                               (if (= (:search-string context) "orders")
                                                 {:data [order-table]}
                                                 {:data [dashboard]}))]
              (let [args {:term-queries ["orders"]
                          :semantic-queries ["sales"]
                          :entity-types ["table" "dashboard"]}
                    results (search/search args)]
                ;; Should return both results combined via RRF
                (is (= 2 (count results)))
                (is (some #(= (:id %) 1) results))
                (is (some #(= (:id %) 2) results)))))

          (testing "search applies RRF to overlapping results"
            (with-redefs [search-core/search (fn [_]
                                               {:data [order-table dashboard]})]
              (let [args {:term-queries ["orders" "sales"]
                          :entity-types ["table" "dashboard"]}
                    results (search/search args)]
                ;; Both queries return same results, RRF should boost them
                (is (= 2 (count results)))
                (is (some #(= (:id %) 1) results))
                (is (some #(= (:id %) 2) results)))))

          (testing "search handles empty results"
            (with-redefs [search-core/search (fn [_] {:data []})]
              (let [args {:term-queries ["nonexistent"]
                          :entity-types ["table"]}
                    results (search/search args)]
                (is (empty? results)))))

          (testing "search with metabot verified content flag"
            (let [metabot {:entity_id "test-bot"
                           :use_verified_content true}]
              (with-redefs [t2/select-one (fn [model & _]
                                            (is (= :model/Metabot model) "Should query for Metabot model")
                                            metabot)
                            search-core/search (fn [context]
                                                ;; Verify that verified flag is set when metabot has use_verified_content
                                                 (is (true? (:verified context)))
                                                 {:data [dashboard]})]
                (let [results (search/search {:term-queries ["test"]
                                              :metabot-id "test-bot"
                                              :entity-types ["dashboard"]})]
                  (is (= 1 (count results)))
                  (is (= 2 (:id (first results)))))))))))))

(deftest search-native-query-test
  (mt/with-test-user :rasta
    (with-redefs [perms/impersonated-user? (fn [] false)
                  perms/sandboxed-user? (fn [] false)
                  api/*current-user-id* 1]
      (testing ":search-native-query is included in context when true"
        (with-redefs [search-core/search (fn [context]
                                           (is (true? (:search-native-query context)))
                                           {:data []})]
          (search/search {:term-queries ["test"]
                          :entity-types ["card"]
                          :search-native-query true})))

      (testing ":search-native-query is not included in context when nil or false"
        (with-redefs [search-core/search (fn [context]
                                           (is (not (contains? context :search-native-query)))
                                           {:data []})]
          (search/search {:term-queries ["test"]
                          :entity-types ["card"]
                          :search-native-query false})
          (search/search {:term-queries ["test"]
                          :entity-types ["card"]
                          :search-native-query nil}))))))
