(ns metabase-enterprise.metabot-v3.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.context :as context]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.test :as mt]))

(def ^:private users-native-query (lib/native-query meta/metadata-provider "SELECT * FROM users"))
(def ^:private users-mbql-query (lib/query meta/metadata-provider (meta/table-metadata :users)))

(deftest database-tables-for-context-prioritization
  (let [used [{:id 1 :name "used1"} {:id 2 :name "used2"}]
        extra [{:id 3 :name "extra1"} {:id 4 :name "extra2"}]
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/enhanced-database-tables (fn [_ {:keys [priority-tables all-tables-limit] :or {all-tables-limit 100}}]
                                                         (let [priority-ids (set (map :id priority-tables))
                                                               non-priority (remove #(priority-ids (:id %)) all-tables)
                                                               result (concat priority-tables (take (- all-tables-limit (count priority-tables)) non-priority))]
                                                           (take all-tables-limit result)))]
      (let [result (#'context/database-tables-for-context {:query users-native-query, :all-tables-limit 3})]
        (is (= used result) "Should only return used tables, in order")
        (is (= (count used) (count result)) "Should return all used tables")
        (is (not-any? #(= 3 (:id %)) result) "Should not include extra tables")
        (is (not-any? #(= 4 (:id %)) result) "Should not include extra tables")
        (is (= (count (distinct (map :id result))) (count result))))))) ; no duplicates

(deftest database-tables-for-context-used-tables-exceed-limit
  (let [used (mapv #(hash-map :id % :name (str "used" %)) (range 1 6)) ; 5 used tables
        extra (mapv #(hash-map :id % :name (str "extra" %)) (range 6 10))
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/enhanced-database-tables (fn [_ {:keys [priority-tables all-tables-limit] :or {all-tables-limit 100}}]
                                                         (let [priority-ids (set (map :id priority-tables))
                                                               non-priority (remove #(priority-ids (:id %)) all-tables)
                                                               result (concat priority-tables (take (- all-tables-limit (count priority-tables)) non-priority))]
                                                           (take all-tables-limit result)))]
      (let [result (#'context/database-tables-for-context {:query users-native-query, :all-tables-limit 3})]
        (is (= used result) "Should return all used tables")
        (is (= (count used) (count result)) "Should return all used tables")
        (is (= (count (distinct (map :id result))) (count result))))))) ; no duplicates

(deftest database-tables-for-context-no-used-tables
  (let [extra (mapv #(hash-map :id % :name (str "extra" %)) (range 1 5))]
    (with-redefs [table-utils/used-tables (fn [_] [])
                  table-utils/enhanced-database-tables (fn [_ opts]
                                                         (take (:all-tables-limit opts 100) extra))]
      (let [result (#'context/database-tables-for-context {:query users-native-query, :all-tables-limit 3})]
        (is (empty? result) "Should return empty when no used tables")))))

(deftest database-tables-for-context-used-tables-exact-limit
  (let [used (mapv #(hash-map :id % :name (str "used" %)) (range 1 4)) ; 3 used tables
        extra (mapv #(hash-map :id % :name (str "extra" %)) (range 4 7))
        all-tables (concat used extra)]
    (with-redefs [table-utils/used-tables (fn [_] used)
                  table-utils/enhanced-database-tables (fn [_ {:keys [priority-tables all-tables-limit] :or {all-tables-limit 100}}]
                                                         (let [priority-ids (set (map :id priority-tables))
                                                               non-priority (remove #(priority-ids (:id %)) all-tables)
                                                               result (concat priority-tables (take (- all-tables-limit (count priority-tables)) non-priority))]
                                                           (take all-tables-limit result)))]
      (let [result (#'context/database-tables-for-context {:query users-native-query, :all-tables-limit 3})]
        (is (= used result) "Should be exactly the used tables, in order")
        (is (= (count used) (count result)))
        (is (= (count (distinct (map :id result))) (count result))))))) ; no duplicates

(deftest database-tables-for-context-exception-handling
  (testing "Returns empty when table-utils/enhanced-database-tables throws"
    (with-redefs [table-utils/used-tables (fn [_] [{:id 1}])
                  table-utils/enhanced-database-tables (fn [_ _] (throw (Exception. "boom")))]
      (let [result (#'context/database-tables-for-context {:query users-native-query})]
        (is (empty? result))))))

(deftest database-tables-for-context-nil-used-tables
  (testing "Handles nil used-tables gracefully"
    (with-redefs [table-utils/used-tables (fn [_] nil)
                  table-utils/enhanced-database-tables (fn [_ opts]
                                                         (take (:all-tables-limit opts 100) [{:id 1} {:id 2}]))]
      (let [result (#'context/database-tables-for-context {:query users-native-query})]
        (is (empty? result) "Should return empty when used-tables is nil")))))

(deftest database-tables-for-context-duplicate-ids
  (testing "Deduplicates tables returned by database-tables"
    (let [used [{:id 1}]
          dup [{:id 1} {:id 1} {:id 2}]]
      (with-redefs [table-utils/used-tables (fn [_] used)
                    table-utils/enhanced-database-tables (fn [_ _] dup)]
        (let [result (#'context/database-tables-for-context {:query users-native-query})]
          (is (= [1 2] (map :id result)) "Should preserve order and remove duplicates"))))))

;; --- enhance-context-with-schema tests ---

(deftest enhance-context-with-schema-native
  (let [mock-tables [{:id 1 :name "table1"} {:id 2 :name "table2"}]]
    (with-redefs [context/database-tables-for-context (fn [_] mock-tables)]
      (testing "Enhances context with schema for native queries"
        (let [input {:user_is_viewing [{:query users-native-query}]}
              result (#'context/enhance-context-with-schema input)]
          (is (= (get-in result [:user_is_viewing 0 :used_tables]) mock-tables)))))))

(deftest enhance-context-with-schema-non-native
  (testing "Does not enhance context for non-native queries"
    (let [input {:user_is_viewing [{:query users-mbql-query}]}
          result (#'context/enhance-context-with-schema input)]
      (is (nil? (get-in result [:user_is_viewing 0 :used_tables]))))))

(deftest enhance-context-with-schema-no-database
  (testing "Does not enhance context if no database present"
    (let [input {:user_is_viewing [{:query (dissoc users-native-query :database)}]}
          result (#'context/enhance-context-with-schema input)]
      (is (nil? (get-in result [:user_is_viewing 0 :used_tables]))))))

(deftest enhance-context-with-schema-complete-native-query
  (testing "Enhances context with schema for complete native query structure"
    (let [mock-tables [{:id 1 :name "users"} {:id 2 :name "orders"}]]
      (with-redefs [context/database-tables-for-context (fn [_] mock-tables)]
        (let [input {:user_is_viewing [{:query users-native-query}]}
              result (#'context/enhance-context-with-schema input)]
          (is (= (get-in result [:user_is_viewing 0 :used_tables]) mock-tables)))))))

(deftest enhance-context-with-schema-complete-mbql-query
  (testing "Does not enhance context for complete MBQL query structure and doesn't call database-tables-for-context"
    (let [call-count (atom 0)]
      (with-redefs [context/database-tables-for-context (fn [_]
                                                          (swap! call-count inc)
                                                          [{:id 1 :name "should-not-be-used"}])]
        (let [input {:user_is_viewing [{:query users-mbql-query}]}
              result (#'context/enhance-context-with-schema input)]
          (is (nil? (get-in result [:user_is_viewing 0 :used_tables]))
              "Should not add database_schema for MBQL queries")
          (is (= 0 @call-count)
              "Should not call database-tables-for-context for MBQL queries"))))))

(deftest enhance-context-with-schema-python-transform
  (testing "Enhances context with schema for Python transforms"
    (let [mock-tables [{:id 24 :name "orders" :schema "public"}
                       {:id 31 :name "products" :schema "public"}]]
      (with-redefs [context/python-transform-tables-for-context
                    (fn [_] mock-tables)]
        (let [input {:user_is_viewing [{:type "transform"
                                        :source {:type "python"
                                                 :source-database 2
                                                 :source-tables {:orders 24
                                                                 :products 31}}}]}
              result (#'context/enhance-context-with-schema input)
              used-tables (get-in result [:user_is_viewing 0 :used_tables])]
          (is (= mock-tables used-tables)))))))

(deftest enhance-context-with-schema-python-transform-no-source-tables
  (testing "Handles Python transform without source-tables"
    (let [called? (atom false)]
      (with-redefs [context/python-transform-tables-for-context
                    (fn [_] (reset! called? true) nil)]
        (let [input {:user_is_viewing [{:type "transform"
                                        :source {:type "python"
                                                 :source-database 2
                                                 :source-tables {}}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (nil? (get-in result [:user_is_viewing 0 :used_tables])))
          (is (false? @called?)))))))

(deftest enhance-context-with-schema-python-transform-no-source-database
  (testing "Handles Python transform without source-database"
    (let [called? (atom false)]
      (with-redefs [context/python-transform-tables-for-context
                    (fn [_] (reset! called? true) nil)]
        (let [input {:user_is_viewing [{:type "transform"
                                        :source {:type "python"
                                                 :source-tables {:orders 24}}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (nil? (get-in result [:user_is_viewing 0 :used_tables])))
          (is (false? @called?)))))))

(deftest capabilities-signalling
  (testing "We signal our capabilities to ai-service"
    (is (= (count (-> (the-ns 'metabase-enterprise.metabot-v3.tools.api)
                      meta
                      :api/endpoints))
           (count (->> (context/create-context {})
                       :capabilities
                       (filter #(str/starts-with? % "backend:"))))))))

(deftest annotate-transform-source-types-native-transform-test
  (testing "Annotates draft native transform with source_type :native"
    (let [input {:user_is_viewing [{:type "transform"
                                    :source {:type :query
                                             :query users-native-query}}]}
          result (#'context/annotate-transform-source-types input)]
      (is (= :native (get-in result [:user_is_viewing 0 :source_type]))))))

(deftest annotate-transform-source-types-mbql-transform-test
  (testing "Annotates draft MBQL transform with source_type :mbql"
    (let [input {:user_is_viewing [{:type "transform"
                                    :source {:type :query
                                             :query users-mbql-query}}]}
          result (#'context/annotate-transform-source-types input)]
      (is (= :mbql (get-in result [:user_is_viewing 0 :source_type]))))))

(deftest annotate-transform-source-types-python-transform-test
  (testing "Annotates draft Python transform with source_type :python"
    (let [input {:user_is_viewing [{:type "transform"
                                    :source {:type :python
                                             :body "import pandas as pd"
                                             :source-database (mt/id)}}]}
          result (#'context/annotate-transform-source-types input)]
      (is (= :python (get-in result [:user_is_viewing 0 :source_type]))))))

(deftest annotate-transform-source-types-normalization-test
  (testing "Transform source query gets normalized before query type detection"
    (let [input {:user_is_viewing [{:type "transform"
                                    :source {:type "query"
                                             :query {:lib/type "mbql/query"
                                                     :stages [{:native "SELECT * FROM users"
                                                               :lib/type "mbql.stage/native"}]
                                                     :database (mt/id)}}}]}
          result (#'context/annotate-transform-source-types input)]
      (is (= :native (get-in result [:user_is_viewing 0 :source_type]))))))

(deftest recent-views-in-context-test
  (testing "Adds recent views to context"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Collection {col-id :id}   {}
                     :model/Card       {card-id :id}   {:type "question"
                                                        :name "my question"
                                                        :description "question description"}
                     :model/Card       {card-id-2 :id} {:type "question"
                                                        :name "my question 2"
                                                        :description "question description 2"}
                     :model/Card       {model-id :id} {:type "model"
                                                       :name "my model"
                                                       :description "model description"}
                     :model/Dashboard  {dash-id :id}  {:name "my dashboard"
                                                       :description "dashboard description"}
                     :model/Table      {table-id :id} {}]
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view)
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id-2 :view)
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card model-id :view)
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Table table-id :selection)
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard dash-id :view)
        (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Collection col-id :view)
        (let [recently-viewed (-> (context/create-context {})
                                  :user_recently_viewed)]
          (is (= 5 (count recently-viewed)))
          ;; Assert that collection is excluded even though it was viewed most recently
          (is (= #{"question" "model" "dashboard" "table"}
                 (set (map :type recently-viewed)))))))))
