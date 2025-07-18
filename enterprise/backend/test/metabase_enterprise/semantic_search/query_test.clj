(ns metabase-enterprise.semantic-search.query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest database-initialised-test
  (is (some? @semantic.db/data-source))
  (is (= {:test 1} (semantic.db/test-connection!))))

(deftest basic-query-test
  (testing "Simple queries with no filters"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Dog-related query finds dog content"
              (let [results (semantic.index/query-index {:search-string "puppy"})]
                (is (= "Dog Training Guide" (-> results first :name)))))

            (testing "Bird-related query finds bird content"
              (let [results (semantic.index/query-index {:search-string "avian"})]
                (is (= "Bird Watching Tips" (-> results first :name)))))))))))

(deftest model-filtering-test
  (testing "Filter results by model type"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Filter for cards only"
              (let [card-results (semantic.index/query-index {:search-string "avian" :models ["card"]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings card-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(= "card" (:model %)) card-results))))

            (testing "Filter for dashboards only"
              (let [dashboard-results (semantic.index/query-index {:search-string "marine mammal" :models ["dashboard"]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings dashboard-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(= "dashboard" (:model %)) dashboard-results))))

            (testing "Filter for multiple model types"
              (let [mixed-results (semantic.index/query-index {:search-string "predator" :models ["card" "dashboard"]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings mixed-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(contains? #{"card" "dashboard"} (:model %)) mixed-results))))))))))

(deftest archived-filtering-test
  (testing "Filter results by archived status"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Include only non-archived items"
              (let [active-results (semantic.index/query-index {:search-string "feline" :archived? false})]
                (is (every? #(not (:archived %))  active-results))))

            (testing "Include only archived items"
              (let [archived-results (semantic.index/query-index {:search-string "feline" :archived? true})
                    filtered-results (semantic.tu/filter-for-mock-embeddings archived-results)]
                (is (pos? (count filtered-results)))
                (is (every? :archived  archived-results))))

            (testing "Include all items regardless of archived status"
              (let [all-results (semantic.index/query-index {:search-string "feline"})
                    filtered-results (semantic.tu/filter-for-mock-embeddings all-results)]
                (is (pos? (count filtered-results)))))))))))

(deftest creator-filtering-test
  (testing "Filter results by creator"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Filter by single creator"
              (let [crowberto-results (semantic.index/query-index {:search-string "aquatic" :created-by [(mt/user->id :crowberto)]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings crowberto-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(= (mt/user->id :crowberto) (:creator_id %)) crowberto-results))))

            (testing "Filter by multiple creators"
              (let [multi-creator-results (semantic.index/query-index {:search-string "endangered species"
                                                                       :created-by    [(mt/user->id :crowberto) (mt/user->id :rasta)]})]
                (is (pos? (count multi-creator-results)))
                (is (every? #(contains? #{(mt/user->id :crowberto) (mt/user->id :rasta)} (:creator_id %)) multi-creator-results))))))))))

(deftest verified-filtering-test
  (testing "Filter results by verified status"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Include only verified items"
              (let [verified-results (semantic.index/query-index {:search-string "puppy" :verified true})
                    filtered-results (semantic.tu/filter-for-mock-embeddings verified-results)]
                (is (pos? (count filtered-results)))
                (is (every? :verified verified-results))))

            (testing "Include all items regardless of verified status when filter not specified"
              (let [all-results (semantic.index/query-index {:search-string "puppy"})
                    filtered-results (semantic.tu/filter-for-mock-embeddings all-results)]
                (is (pos? (count filtered-results)))))))))))

(deftest complex-filtering-test
  (testing "Complex filters with multiple criteria"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (semantic.tu/with-index!
            (testing "Non-archived cards by specific creator"
              (let [results (semantic.index/query-index {:search-string "equine"
                                                         :models ["card"]
                                                         :archived? false
                                                         :created-by [(mt/user->id :rasta)]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings results)]
                (is (pos? (count filtered-results)))
                (is (every? #(and (= "card" (:model %))
                                  (not (:archived %))
                                  (= (mt/user->id :rasta) (:creator_id %))) results))))

            (testing "Archived dashboards by multiple creators"
              (let [results (semantic.index/query-index {:search-string "Antarctic wildlife"
                                                         :models ["dashboard"]
                                                         :archived? true
                                                         :created-by [(mt/user->id :crowberto) (mt/user->id :rasta)]})
                    filtered-results (semantic.tu/filter-for-mock-embeddings results)]
                (is (pos? (count filtered-results)))
                (is (every? #(and (= "dashboard" (:model %))
                                  (:archived %)
                                  (contains? #{(mt/user->id :crowberto) (mt/user->id :rasta)} (:creator_id %))) results))))

            (testing "Verified items with additional filters"
              (let [results (semantic.index/query-index {:search-string "marine mammal"
                                                         :models ["dashboard"]
                                                         :verified true
                                                         :archived? false})]
                (is (every? #(and (= "dashboard" (:model %))
                                  (:verified %)
                                  (not (:archived %))) results))))))))))

(deftest permissions-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-index!
        (let [monsters-table   (t2/select-one-pk :model/Table :name "Monsters Table")
              q                (fn [model s] (map :name (semantic.index/query-index {:search-string s, :models [model]})))
              all-users        (perms-group/all-users)
              unrestrict-table (fn [table-id]
                                 (data-perms/set-table-permission! all-users table-id :perms/create-queries :query-builder)
                                 (data-perms/set-table-permission! all-users table-id :perms/view-data      :unrestricted))
              restrict-table   (fn [table-id]
                                 (data-perms/set-table-permission! all-users table-id :perms/create-queries :no)
                                 (data-perms/set-table-permission! all-users table-id :perms/view-data      :blocked))]
          (perms/revoke-collection-permissions! (perms-group/all-users) (t2/select-one :model/Collection :name "Cryptozoology"))
          (restrict-table monsters-table)
          (testing "admin"
            (mt/with-test-user :crowberto
              (testing "collection permissions"
                (is (some #{"Loch Ness Stuff"}   (q "dashboard" "prehistoric monsters")))
                (is (some #{"Bigfoot Sightings"} (q "card"      "spooky video evidence"))))
              (testing "data permissions"
                (is (some #{"Monsters Table"} (q "table" "monster facts"))))))
          (testing "all-users"
            (mt/with-test-user :rasta
              (testing "collection permissions"
                (is (not-any? #{"Loch Ness Stuff"}   (q "dashboard" "prehistoric monsters")))
                (is (not-any? #{"Bigfoot Sightings"} (q "card"      "spooky video evidence"))))
              (testing "data permissions"
                (is (not-any? #{"Monsters Table"} (q "table" "monster facts"))))
              (testing "give data permissions"
                (unrestrict-table monsters-table)
                (data-perms/disable-perms-cache
                 (is (some #{"Monsters Table"} (q "table" "monster facts"))))))))))))

(deftest basic-batched-query-test
  (testing "Small-batch reindexing"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-mocked-embeddings!
          (binding [semantic.index/*batch-size* 1]
            (semantic.tu/with-index!
              (testing "Horse-related query finds horse content"
                (let [results (semantic.index/query-index {:search-string "equine"})]
                  (is (= "Horse Racing Analysis" (-> results first :name)))))

              (testing "Tiger-related query finds tiger content"
                (let [results (semantic.index/query-index {:search-string "endangered species"})]
                  (is (= "Tiger Conservation" (-> results first :name))))))))))))
