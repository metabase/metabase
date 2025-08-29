(ns metabase-enterprise.metabot-v3.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.context :as context]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]))

(deftest database-tables-for-context-prioritization
  (let [used [{:id 1 :name "used1"} {:id 2 :name "used2"}]
        extra [{:id 3 :name "extra1"} {:id 4 :name "extra2"}]
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/database-tables (fn [_ opts]
                                                (take (:all-tables-limit opts 100) all-tables))]
      (let [result (#'context/database-tables-for-context 123 {:query {:native {:query "SELECT *"}} :all-tables-limit 3})]
        (is (= (take 2 result) used) "Used tables should be first")
        (is (= 3 (count result)) "Should respect limit")
        (is (some #(= 3 (:id %)) result) "Should include extra table if room")
        (is (not (some #(= 4 (:id %)) result)) "Should not exceed limit")
        (is (= (count (distinct (map :id result))) (count result))) ; no duplicates
        ))))

(deftest database-tables-for-context-used-tables-exceed-limit
  (let [used (mapv #(hash-map :id % :name (str "used" %)) (range 1 6)) ; 5 used tables
        extra (mapv #(hash-map :id % :name (str "extra" %)) (range 6 10))
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/database-tables (fn [_ opts]
                                                (take (:all-tables-limit opts 100) all-tables))]
      (let [result (#'context/database-tables-for-context 123 {:query {:native {:query "SELECT *"}} :all-tables-limit 3})]
        (is (= 3 (count result)) "Should respect limit")
        (is (every? (set used) result) "Only used tables should be present if they exceed limit")
        (is (= (count (distinct (map :id result))) (count result))) ; no duplicates
        ))))

(deftest database-tables-for-context-no-used-tables
  (let [extra (mapv #(hash-map :id % :name (str "extra" %)) (range 1 5))]
    (with-redefs [table-utils/used-tables (fn [_] [])
                  table-utils/database-tables (fn [_ opts]
                                                (take (:all-tables-limit opts 100) extra))]
      (let [result (#'context/database-tables-for-context 123 {:query {:native {:query "SELECT *"}} :all-tables-limit 3})]
        (is (= 3 (count result)))
        (is (every? (set extra) result))
        (is (= (count (distinct (map :id result))) (count result))) ; no duplicates
        ))))

(deftest database-tables-for-context-used-tables-exact-limit
  (let [used (mapv #(hash-map :id % :name (str "used" %)) (range 1 4)) ; 3 used tables
        extra (mapv #(hash-map :id % :name (str "extra" %)) (range 4 7))
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/database-tables (fn [_ opts]
                                                (take (:all-tables-limit opts 100) all-tables))]
      (let [result (#'context/database-tables-for-context 123 {:query {:native {:query "SELECT *"}} :all-tables-limit 3})]
        (is (= 3 (count result)))
        (is (= used result) "Should be exactly the used tables, in order")
        (is (= (count (distinct (map :id result))) (count result))) ; no duplicates
        ))))

;; --- enhance-context-with-schema tests ---

(deftest enhance-context-with-schema-native
  (let [mock-tables [{:id 1 :name "table1"} {:id 2 :name "table2"}]]
    (with-redefs [context/database-tables-for-context (fn [_ _] mock-tables)]
      (testing "Enhances context with schema for native queries"
        (let [input {:user_is_viewing [{:query {:type :native :database 123}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (= (get-in result [:user_is_viewing 0 :database_schema]) mock-tables)))))))

(deftest enhance-context-with-schema-non-native
  (testing "Does not enhance context for non-native queries"
    (let [input {:user_is_viewing [{:query {:type :query :database 123}}]}
          result (#'context/enhance-context-with-schema input)]
      (is (nil? (get-in result [:user_is_viewing 0 :database_schema]))))))

(deftest enhance-context-with-schema-no-database
  (testing "Does not enhance context if no database present"
    (let [input {:user_is_viewing [{:query {:type :native}}]}
          result (#'context/enhance-context-with-schema input)]
      (is (nil? (get-in result [:user_is_viewing 0 :database_schema]))))))

(deftest enhance-context-with-schema-complete-native-query
  (testing "Enhances context with schema for complete native query structure"
    (let [mock-tables [{:id 1 :name "users"} {:id 2 :name "orders"}]]
      (with-redefs [context/database-tables-for-context (fn [_ _] mock-tables)]
        (let [input {:user_is_viewing [{:query {:type :native
                                                :database 123
                                                :native {:query "SELECT * FROM users WHERE active = true"}}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (= (get-in result [:user_is_viewing 0 :database_schema]) mock-tables)))))))

(deftest enhance-context-with-schema-complete-mbql-query
  (testing "Does not enhance context for complete MBQL query structure and doesn't call database-tables-for-context"
    (let [call-count (atom 0)]
      (with-redefs [context/database-tables-for-context (fn [_ _]
                                                          (swap! call-count inc)
                                                          [{:id 1 :name "should-not-be-used"}])]
        (let [input {:user_is_viewing [{:query {:type :query
                                                :database 123
                                                :query {:source-table 456
                                                        :aggregation [[:count]]
                                                        :breakout [[:field 789 nil]]}}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (nil? (get-in result [:user_is_viewing 0 :database_schema]))
              "Should not add database_schema for MBQL queries")
          (is (= 0 @call-count)
              "Should not call database-tables-for-context for MBQL queries"))))))

(deftest capabilities-signalling
  (testing "We signal our capabilities to ai-service"
    (is (= (count (-> (the-ns 'metabase-enterprise.metabot-v3.tools.api)
                      meta
                      :api/endpoints))
           (count (->> (context/create-context {})
                       :capabilities
                       (filter #(str/starts-with? % "backend:"))))))))
