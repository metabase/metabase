(ns metabase-enterprise.semantic-search.query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest basic-query-test
  (testing "Simple queries with no filters"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (semantic.tu/with-only-semantic-weights
            (testing "Dog-related query finds dog content"
              (let [results (-> (semantic.tu/query-index {:search-string "puppy"})
                                semantic.tu/filter-for-mock-embeddings)]
                (is (= "Dog Training Guide" (-> results first :name)))))

            (testing "Bird-related query finds bird content"
              (let [results (-> (semantic.tu/query-index {:search-string "avian"})
                                semantic.tu/filter-for-mock-embeddings)]
                (is (= "Bird Watching Tips" (-> results first :name)))))))))))

(defn- index-of-name
  "Return the index of the item with :name `name` in `coll`"
  [coll name]
  (first (keep-indexed (fn [idx item]
                         (when (= name (:name item))
                           idx))
                       coll)))

(deftest native-query-test
  (testing "Tests for :search-native-query"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (semantic.tu/with-only-semantic-weights
            (let [not-top-10? #(or (nil? %) (< 10 %))]
              (doseq [{:keys [name desc search-string search-native-query? expected-index?]}
                      [{:name "Dog Training Guide"
                        :desc "contains"
                        :search-string "AVG(tricks)"
                        :search-native-query? false
                        :expected-index? not-top-10?}
                       {:name "Dog Training Guide"
                        :desc "contains"
                        :search-string "AVG(tricks)"
                        :search-native-query? true
                        :expected-index? zero?}
                       {:name "Dog Training Guide"
                        :desc "contains"
                        :search-string "GROUP BY breed"
                        :search-native-query? false
                        :expected-index? not-top-10?}
                       {:name "Dog Training Guide"
                        :desc "contains"
                        :search-string "GROUP BY breed"
                        :search-native-query? true
                        :expected-index? zero?}
                       {:name "Dog Training Guide"
                        :desc "does not contain"
                        :search-string "SUM(tricks)"
                        :search-native-query? false
                        :expected-index? not-top-10?}
                       {:name "Dog Training Guide"
                        :desc "does not contain"
                        :search-string "SUM(tricks)"
                        :search-native-query? true
                        :expected-index? not-top-10?}
                       {:name "Bird Watching Tips"
                        :desc "does not contain (no native query)"
                        :search-string "AVG(tricks)"
                        :search-native-query? true
                        :expected-index? not-top-10?}
                       {:name "Dog Training Guide"
                        :desc "semantic search"
                        :search-string "puppy"
                        :search-native-query? true
                        :expected-index? zero?}
                       {:name "Bird Watching Tips"
                        :desc "semantic search"
                        :search-string "avian"
                        :search-native-query? true
                        :expected-index? zero?}
                       {:name "Dog Training Guide"
                        :desc "non-native keyword query"
                        :search-string "Training"
                        :search-native-query? true
                        :expected-index? zero?}
                       {:name "Bird Watching Tips"
                        :desc "non-native keyword query"
                        :search-string "Watching"
                        :search-native-query? true
                        :expected-index? zero?}]]
                (testing (format "\n%s %s %s %s" name desc search-string search-native-query?)
                  (is (-> (semantic.tu/query-index {:search-string search-string
                                                    :search-native-query search-native-query?})
                          (index-of-name name)
                          expected-index?)))))))))))

(deftest model-filtering-test
  (testing "Filter results by model type"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (testing "Filter for cards only"
            (let [card-results (semantic.tu/query-index {:search-string "avian" :models ["card"]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings card-results)]
              (is (pos? (count filtered-results)))
              (is (every? #(= "card" (:model %)) card-results))))

          (testing "Filter for dashboards only"
            (let [dashboard-results (semantic.tu/query-index {:search-string "marine mammal" :models ["dashboard"]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings dashboard-results)]
              (is (pos? (count filtered-results)))
              (is (every? #(= "dashboard" (:model %)) dashboard-results))))

          (testing "Filter for multiple model types"
            (let [mixed-results (semantic.tu/query-index {:search-string "predator" :models ["card" "dashboard"]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings mixed-results)]
              (is (pos? (count filtered-results)))
              (is (every? #(contains? #{"card" "dashboard"} (:model %)) mixed-results)))))))))

(deftest archived-filtering-test
  (testing "Filter results by archived status"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (testing "Include only non-archived items"
            (let [active-results (semantic.tu/query-index {:search-string "feline" :archived? false})]
              (is (every? #(not (:archived %)) active-results))))

          (testing "Include only archived items"
            (let [archived-results (semantic.tu/query-index {:search-string "feline" :archived? true})
                  filtered-results (semantic.tu/filter-for-mock-embeddings archived-results)]
              (is (pos? (count filtered-results)))
              (is (every? :archived archived-results))))

          (testing "Include all items regardless of archived status"
            (let [all-results (semantic.tu/query-index {:search-string "feline"})
                  filtered-results (semantic.tu/filter-for-mock-embeddings all-results)]
              (is (pos? (count filtered-results))))))))))

(deftest creator-filtering-test
  (testing "Filter results by creator"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (testing "Filter by single creator"
            (let [crowberto-results (semantic.tu/query-index {:search-string "aquatic" :created-by [(mt/user->id :crowberto)]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings crowberto-results)]
              (is (pos? (count filtered-results)))
              (is (every? #(= (mt/user->id :crowberto) (:creator_id %)) crowberto-results))))

          (testing "Filter by multiple creators"
            (let [multi-creator-results (semantic.tu/query-index {:search-string "endangered species"
                                                                  :created-by [(mt/user->id :crowberto) (mt/user->id :rasta)]})]
              (is (pos? (count multi-creator-results)))
              (is (every? #(contains? #{(mt/user->id :crowberto) (mt/user->id :rasta)} (:creator_id %)) multi-creator-results)))))))))

(deftest verified-filtering-test
  (testing "Filter results by verified status"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (testing "Include only verified items"
            (let [verified-results (semantic.tu/query-index {:search-string "puppy" :verified true})
                  filtered-results (semantic.tu/filter-for-mock-embeddings verified-results)]
              (is (pos? (count filtered-results)))
              (is (every? :verified verified-results))))

          (testing "Include all items regardless of verified status when filter not specified"
            (let [all-results (semantic.tu/query-index {:search-string "puppy"})
                  filtered-results (semantic.tu/filter-for-mock-embeddings all-results)]
              (is (pos? (count filtered-results))))))))))

(deftest complex-filtering-test
  (testing "Complex filters with multiple criteria"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (semantic.tu/with-test-db! {:mode :mock-indexed}
          (testing "Non-archived cards by specific creator"
            (let [results (semantic.tu/query-index {:search-string "equine"
                                                    :models ["card"]
                                                    :archived? false
                                                    :created-by [(mt/user->id :rasta)]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings results)]
              (is (pos? (count filtered-results)))
              (is (every? #(and (= "card" (:model %))
                                (not (:archived %))
                                (= (mt/user->id :rasta) (:creator_id %))) results))))

          (testing "Archived dashboards by multiple creators"
            (let [results (semantic.tu/query-index {:search-string "Antarctic wildlife"
                                                    :models ["dashboard"]
                                                    :archived? true
                                                    :created-by [(mt/user->id :crowberto) (mt/user->id :rasta)]})
                  filtered-results (semantic.tu/filter-for-mock-embeddings results)]
              (is (pos? (count filtered-results)))
              (is (every? #(and (= "dashboard" (:model %))
                                (:archived %)
                                (contains? #{(mt/user->id :crowberto) (mt/user->id :rasta)} (:creator_id %))) results))))

          (testing "Verified items with additional filters"
            (let [results (semantic.tu/query-index {:search-string "marine mammal"
                                                    :models ["dashboard"]
                                                    :verified true
                                                    :archived? false})]
              (is (every? #(and (= "dashboard" (:model %))
                                (:verified %)
                                (not (:archived %))) results)))))))))

(deftest permissions-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db! {:mode :mock-indexed}
      (let [monsters-table (t2/select-one-pk :model/Table :name "Monsters Table")
            q (fn [model s] (map :name (semantic.tu/query-index {:search-string s, :models [model]})))
            all-users (perms-group/all-users)
            unrestrict-table (fn [table-id]
                               (data-perms/set-table-permission! all-users table-id :perms/create-queries :query-builder)
                               (data-perms/set-table-permission! all-users table-id :perms/view-data :unrestricted))
            restrict-table (fn [table-id]
                             (data-perms/set-table-permission! all-users table-id :perms/create-queries :no)
                             (data-perms/set-table-permission! all-users table-id :perms/view-data :blocked))]
        (perms/revoke-collection-permissions! (perms-group/all-users) (t2/select-one :model/Collection :name "Cryptozoology"))
        (restrict-table monsters-table)
        (testing "admin"
          (mt/with-test-user :crowberto
            (testing "collection permissions"
              (is (some #{"Loch Ness Stuff"} (q "dashboard" "prehistoric monsters")))
              (is (some #{"Bigfoot Sightings"} (q "card" "spooky video evidence"))))
            (testing "data permissions"
              (is (some #{"Monsters Table"} (q "table" "monster facts"))))))
        (testing "all-users"
          (mt/with-test-user :rasta
            (testing "collection permissions"
              (is (not-any? #{"Loch Ness Stuff"} (q "dashboard" "prehistoric monsters")))
              (is (not-any? #{"Bigfoot Sightings"} (q "card" "spooky video evidence"))))
            (testing "data permissions"
              (is (not-any? #{"Monsters Table"} (q "table" "monster facts"))))
            (testing "give data permissions"
              (unrestrict-table monsters-table)
              (data-perms/disable-perms-cache
               (is (some #{"Monsters Table"} (q "table" "monster facts")))))))))))

(deftest basic-batched-query-test
  (testing "Small-batch reindexing"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (binding [semantic.index/*batch-size* 1]
          (semantic.tu/with-test-db! {:mode :mock-indexed}
            (semantic.tu/with-only-semantic-weights
              (testing "Horse-related query finds horse content"
                (let [results (-> (semantic.tu/query-index {:search-string "marine mammal"})
                                  semantic.tu/filter-for-mock-embeddings)]
                  (is (= "Whale Communication" (-> results first :name)))))

              (testing "Tiger-related query finds tiger content"
                (let [results (-> (semantic.tu/query-index {:search-string "endangered species"})
                                  semantic.tu/filter-for-mock-embeddings)]
                  (is (= "Tiger Conservation" (-> results first :name))))))))))))
