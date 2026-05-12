(ns metabase.metabot.context-test
  (:require
   [clojure.test :refer :all]
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.content-verification.core :as moderation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.agent.user-context :as user-context]
   [metabase.metabot.context :as context]
   [metabase.metabot.table-utils :as table-utils]
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
                                                 :source-tables [{:alias "orders" :table_id 24}
                                                                 {:alias "products" :table_id 31}]}}]}
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
                                                 :source-tables []}}]}
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
                                                 :source-tables [{:alias "orders" :table_id 24}]}}]}
              result (#'context/enhance-context-with-schema input)]
          (is (nil? (get-in result [:user_is_viewing 0 :used_tables])))
          (is (false? @called?)))))))

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

(deftest recent-views-verified-content-filter-test
  (testing "Recent views filtering by verified content"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Card      {vq1 :id}        {:type "question" :name "verified q1"}
                     :model/Card      {vq2 :id}        {:type "question" :name "verified q2"}
                     :model/Card      {vm1 :id}        {:type "model"    :name "verified m1"}
                     :model/Card      {vm2 :id}        {:type "model"    :name "verified m2"}
                     :model/Dashboard {vd :id}         {:name "verified d"}
                     :model/Card      {uq :id}         {:type "question" :name "unverified q"}
                     :model/Card      {um :id}         {:type "model"    :name "unverified m"}
                     :model/Dashboard {ud :id}         {:name "unverified d"}
                     :model/Table     {table-id :id}   {}
                     :model/Metabot   {metabot-eid :entity_id} {:name "test metabot"
                                                                :use_verified_content true}]
        (doseq [[id type] [[vq1 "card"] [vq2 "card"] [vm1 "card"] [vm2 "card"] [vd "dashboard"]]]
          (moderation/create-review! {:moderated_item_id   id
                                      :moderated_item_type type
                                      :moderator_id        (mt/user->id :crowberto)
                                      :status              "verified"}))
        ;; Insert verified items first (oldest), then table, then unverified (newest). Without
        ;; filtering, `(take 5 …)` captures the 3 unverified + the table + 1 verified.
        ;; Recents in newest-first order: ud, um, uq, table, vd, vm2, vm1, vq2, vq1.
        (doseq [[model id] [[:model/Card vq1]
                            [:model/Card vq2]
                            [:model/Card vm1]
                            [:model/Card vm2]
                            [:model/Dashboard vd]
                            [:model/Table table-id]
                            [:model/Card uq]
                            [:model/Card um]
                            [:model/Dashboard ud]]]
          (recent-views/update-users-recent-views! (mt/user->id :rasta) model id :view))

        ;; IDs are unique per model but can collide across models (e.g. a Card and a Dashboard
        ;; can share the same id). Identify items by [:type :id] pairs so cross-model collisions
        ;; don't mask filtering bugs.
        (let [as-pair (fn [type id] [type id])
              vm1*    (as-pair "model"     vm1)
              vm2*    (as-pair "model"     vm2)
              vd*     (as-pair "dashboard" vd)
              uq*     (as-pair "question"  uq)
              um*     (as-pair "model"     um)
              ud*     (as-pair "dashboard" ud)
              table*  (as-pair "table"     table-id)
              keys-of (fn [items] (set (map (juxt :type :id) items)))]

          (testing "no metabot-id passed -> no filtering (even with :content-verification active)"
            (mt/with-premium-features #{:content-verification}
              (let [items (-> (context/create-context {}) :user_recently_viewed)
                    ks    (keys-of items)]
                (is (= 5 (count items)))
                (is (contains? ks uq*))
                (is (contains? ks um*))
                (is (contains? ks ud*))
                (is (contains? ks table*)))))

          (testing "use_verified_content=true with :content-verification feature -> filters"
            (mt/with-premium-features #{:content-verification}
              (let [items (-> (context/create-context {} {:metabot-id metabot-eid})
                              :user_recently_viewed)
                    ks    (keys-of items)]
                (is (contains? ks table*) "tables are not moderatable and pass through")
                (is (contains? ks vd*))
                (is (not (contains? ks uq*)))
                (is (not (contains? ks um*)))
                (is (not (contains? ks ud*)))
                (testing "filter is applied *before* `take 5` — verified items deeper in the list survive"
                  (is (= 5 (count items))
                      "Should keep 5 items even though 3 unverified items were ahead of older verified items")
                  (is (contains? ks vm2*))
                  (is (contains? ks vm1*))))))

          (testing "use_verified_content=true but premium feature absent -> no filtering"
            (mt/with-premium-features #{}
              (let [items (-> (context/create-context {} {:metabot-id metabot-eid})
                              :user_recently_viewed)
                    ks    (keys-of items)]
                (is (contains? ks uq*))
                (is (contains? ks um*))
                (is (contains? ks ud*)))))

          (testing "metabot-id that does not resolve -> no filtering"
            (mt/with-premium-features #{:content-verification}
              (let [items (-> (context/create-context {} {:metabot-id "nonexistent-entity-id"})
                              :user_recently_viewed)
                    ks    (keys-of items)]
                (is (contains? ks uq*))))))))))

(deftest recent-views-most-recent-review-wins-test
  (testing "A card that was verified and later un-verified is correctly excluded"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:content-verification}
        (mt/with-temp [:model/Card    {card-id :id}      {:type "question" :name "flip-flop"}
                       :model/Metabot {metabot-eid :entity_id} {:name "test metabot"
                                                                :use_verified_content true}]
          ;; First verify, then un-verify. create-review! marks older rows as most_recent=false.
          (moderation/create-review! {:moderated_item_id   card-id
                                      :moderated_item_type "card"
                                      :moderator_id        (mt/user->id :crowberto)
                                      :status              "verified"})
          (moderation/create-review! {:moderated_item_id   card-id
                                      :moderated_item_type "card"
                                      :moderator_id        (mt/user->id :crowberto)
                                      :status              nil})
          (recent-views/update-users-recent-views! (mt/user->id :rasta) :model/Card card-id :view)
          (let [items (-> (context/create-context {} {:metabot-id metabot-eid})
                          :user_recently_viewed)
                ids   (set (map :id items))]
            (is (not (contains? ids card-id))
                "Most-recent review with status=nil means the card is no longer verified")))))))

(deftest enhance-context-with-schema-mbql-query-test
  (testing "MBQL adhoc query gets source table added to used_tables"
    (mt/with-test-user :rasta
      (let [table-id (mt/id :orders)
            input    {:user_is_viewing [{:type  "adhoc"
                                         :query {:database    (mt/id)
                                                 :lib/type    "mbql/query"
                                                 :stages      [{:lib/type     "mbql.stage/mbql"
                                                                :source-table table-id}]}}]}
            result   (#'context/enhance-context-with-schema input)
            tables   (get-in result [:user_is_viewing 0 :used_tables])]
        (is (seq tables) "Should have used_tables for MBQL query")
        (is (some #(= table-id (:id %)) tables)
            (str "Should include source table " table-id " in used_tables"))))))

(deftest enhance-context-mbql-viewing-context-rendering-test
  (testing "MBQL adhoc query viewing context includes table name for LLM"
    (mt/with-test-user :rasta
      (let [mp (mt/metadata-provider)
            raw      {:user_is_viewing [{:type  "adhoc"
                                         :query (lib/query  mp (lib.metadata/table mp (mt/id :orders)))}]
                      :current_time_with_timezone "2025-01-15T12:00:00+02:00"}
            enriched (context/create-context raw)
            uc-vars  (user-context/enrich-context-for-template enriched)
            viewing  (:viewing_context uc-vars)]
        (testing "viewing context is non-empty"
          (is (seq viewing)))
        (testing "mentions notebook editor"
          (is (re-find #"notebook editor" viewing)))
        (testing "mentions the source table name"
          ;; The test DB's orders table should appear
          (is (re-find #"(?i)orders" viewing)
              (str "Expected 'orders' in viewing context, got:\n" viewing)))))))

(deftest enhance-context-with-schema-mbql-not-native-test
  (testing "Native query inside adhoc still uses SQL parsing path, not MBQL path"
    (let [called-mbql?   (atom false)
          called-native? (atom false)]
      (with-redefs [context/mbql-source-table-ids
                    (fn [_] (reset! called-mbql? true) nil)
                    context/database-tables-for-context
                    (fn [_] (reset! called-native? true) [{:id 1 :name "t"}])]
        (let [input  {:user_is_viewing [{:type  "adhoc"
                                         :query {:database (mt/id)
                                                 :type     "native"
                                                 :native   {:query "SELECT 1"}}}]}
              _      (#'context/enhance-context-with-schema input)]
          (is (true? @called-native?) "Should use native SQL parsing path")
          (is (false? @called-mbql?) "Should NOT use MBQL path for native queries"))))))
