(ns metabase-enterprise.semantic-search.query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(def ^:private mock-embeddings
  "Static mapping from strings to (made-up) 4-dimensional embedding vectors for testing. Each pair of strings represents a
  document and a search query that should be most semantically similar to it, according to the embeddings."
  {"Dog Training Guide"    [0.12 -0.34  0.56 -0.78]
   "puppy"                 [0.13 -0.33  0.57 -0.77]
   "Bird Watching Tips"    [0.23  0.45 -0.67  0.89]
   "avian"                 [0.24  0.46 -0.66  0.88]
   "Cat Behavior Study"    [0.11 -0.22  0.33 -0.44]
   "feline"                [0.12 -0.21  0.34 -0.43]
   "Horse Racing Analysis" [0.55  0.66 -0.77  0.88]
   "equine"                [0.56  0.67 -0.76  0.87]
   "Fish Tank Setup"       [0.10  0.20 -0.30  0.40]
   "aquatic"               [0.11  0.21 -0.29  0.39]
   "Elephant Migration"    [0.15 -0.25  0.35 -0.45]
   "pachyderm"             [0.16 -0.24  0.36 -0.44]
   "Lion Pride Dynamics"   [0.31  0.42 -0.53  0.64]
   "predator"              [0.32  0.43 -0.52  0.63]
   "Penguin Colony Study"  [0.75 -0.86  0.97 -0.18]
   "Antarctic wildlife"    [0.76 -0.85  0.96 -0.17]
   "Whale Communication"   [0.29  0.38 -0.47  0.56]
   "marine mammal"         [0.30  0.39 -0.46  0.55]
   "Tiger Conservation"    [0.65 -0.74  0.83 -0.92]
   "endangered species"    [0.66 -0.73  0.84 -0.91]
   "Butterfly Migration"   [0.17  0.28 -0.39  0.50]
   "insect patterns"       [0.18  0.29 -0.38  0.49]
   "Loch Ness Stuff"       [0.88  0.40  0.12 -0.34]
   "prehistoric monsters"  [0.89  0.41  0.13 -0.33]
   "Bigfoot Sightings"     [0.91  0.56  0.75  0.11]
   "spooky video evidence" [0.90  0.56  0.74  0.12]
   "Monsters Table"        [0.44  0.13 -0.44  -0.88]
   "monster facts"         [0.43  0.14 -0.43  -0.89]})

(defn- filter-for-mock-embeddings
  "Filter results to only include items whose names are keys in mock-embeddings map."
  [results]
  (filter #(contains? mock-embeddings (:name %)) results))

(defmacro ^:private with-mocked-embeddings! [& body]
  ;; TODO: it's warning about not using with-redefs outside of tests but we *are* using it in tests
  #_:clj-kondo/ignore
  `(with-redefs [semantic.embedding/pull-model (fn [] nil)
                 semantic.embedding/get-embedding (fn [text#]
                                                    (get mock-embeddings text# [0.01 0.02 0.03 0.04]))]
     ~@body))

(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn- once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

(use-fixtures :once #'once-fixture)

(deftest database-initialised-test
  (is (some? @semantic.db/data-source))
  (is (= {:test 1} (semantic.db/test-connection!))))

(defmacro ^:private with-temp-index-table! [& body]
  `(let [test-table-name# (keyword (str "test_search_index_" (nano-id/nano-id)))]
     (binding [semantic.index/*index-table-name* test-table-name#]
       (with-redefs [semantic.embedding/model-dimensions (constantly 4)]
         (try
           (semantic.index/create-index-table! {:force-reset? true})
           ~@body
           (finally
             (try
               (semantic.index/drop-index-table!)
               (catch Exception e#
                 (log/error "Warning: failed to clean up test table" test-table-name# ":" (.getMessage e#))))))))))

(defmacro with-index!
  "Ensure a clean, small index for testing populated with a few collections, cards, and dashboards."
  [& body]
  `(with-temp-index-table!
     (binding [search.ingestion/*force-sync* true]
       (mt/dataset ~(symbol "test-data")
         (mt/with-temp [:model/Collection       {col1# :id}  {:name "Wildlife Collection" :archived false}
                        :model/Collection       {col2# :id}  {:name "Archived Animals" :archived true}
                        :model/Collection       {col3# :id}  {:name "Cryptozoology", :archived false}
                        :model/Card             {card1# :id} {:name "Dog Training Guide" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}
                        :model/Card             {}           {:name "Bird Watching Tips" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}
                        :model/Card             {}           {:name "Cat Behavior Study" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}
                        :model/Card             {}           {:name "Horse Racing Analysis" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}
                        :model/Card             {}           {:name "Fish Tank Setup" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}
                        :model/Card             {}           {:name "Bigfoot Sightings" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}
                        :model/ModerationReview {}           {:moderated_item_type "card"
                                                              :moderated_item_id card1#
                                                              :moderator_id (mt/user->id :crowberto)
                                                              :status "verified"
                                                              :most_recent true}
                        :model/Dashboard        {}           {:name "Elephant Migration" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}
                        :model/Dashboard        {}           {:name "Lion Pride Dynamics" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}
                        :model/Dashboard        {}           {:name "Penguin Colony Study" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}
                        :model/Dashboard        {}           {:name "Whale Communication" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}
                        :model/Dashboard        {}           {:name "Tiger Conservation" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}
                        :model/Dashboard        {}           {:name "Loch Ness Stuff" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}
                        :model/Database         {db-id# :id} {:name "Animal Database"}
                        :model/Table            {}           {:name "Species Table", :db_id db-id#}
                        :model/Table            {}           {:name "Monsters Table", :db_id db-id#, :active true}]
           (search.core/reindex! :search.engine/semantic {:force-reset true})
           ~@body)))))

(deftest basic-query-test
  (testing "Simple queries with no filters"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (with-mocked-embeddings!
          (with-index!
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
        (with-mocked-embeddings!
          (with-index!
            (testing "Filter for cards only"
              (let [card-results (semantic.index/query-index {:search-string "avian" :models ["card"]})
                    filtered-results (filter-for-mock-embeddings card-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(= "card" (:model %)) card-results))))

            (testing "Filter for dashboards only"
              (let [dashboard-results (semantic.index/query-index {:search-string "marine mammal" :models ["dashboard"]})
                    filtered-results (filter-for-mock-embeddings dashboard-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(= "dashboard" (:model %)) dashboard-results))))

            (testing "Filter for multiple model types"
              (let [mixed-results (semantic.index/query-index {:search-string "predator" :models ["card" "dashboard"]})
                    filtered-results (filter-for-mock-embeddings mixed-results)]
                (is (pos? (count filtered-results)))
                (is (every? #(contains? #{"card" "dashboard"} (:model %)) mixed-results))))))))))

(deftest archived-filtering-test
  (testing "Filter results by archived status"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (with-mocked-embeddings!
          (with-index!
            (testing "Include only non-archived items"
              (let [active-results (semantic.index/query-index {:search-string "feline" :archived? false})]
                (is (every? #(not (:archived %))  active-results))))

            (testing "Include only archived items"
              (let [archived-results (semantic.index/query-index {:search-string "feline" :archived? true})
                    filtered-results (filter-for-mock-embeddings archived-results)]
                (is (pos? (count filtered-results)))
                (is (every? :archived  archived-results))))

            (testing "Include all items regardless of archived status"
              (let [all-results (semantic.index/query-index {:search-string "feline"})
                    filtered-results (filter-for-mock-embeddings all-results)]
                (is (pos? (count filtered-results)))))))))))

(deftest creator-filtering-test
  (testing "Filter results by creator"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (with-mocked-embeddings!
          (with-index!
            (testing "Filter by single creator"
              (let [crowberto-results (semantic.index/query-index {:search-string "aquatic" :created-by [(mt/user->id :crowberto)]})
                    filtered-results (filter-for-mock-embeddings crowberto-results)]
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
        (with-mocked-embeddings!
          (with-index!
            (testing "Include only verified items"
              (let [verified-results (semantic.index/query-index {:search-string "puppy" :verified true})
                    filtered-results (filter-for-mock-embeddings verified-results)]
                (is (pos? (count filtered-results)))
                (is (every? :verified verified-results))))

            (testing "Include all items regardless of verified status when filter not specified"
              (let [all-results (semantic.index/query-index {:search-string "puppy"})
                    filtered-results (filter-for-mock-embeddings all-results)]
                (is (pos? (count filtered-results)))))))))))

(deftest complex-filtering-test
  (testing "Complex filters with multiple criteria"
    (mt/with-premium-features #{:semantic-search}
      (mt/as-admin
        (with-mocked-embeddings!
          (with-index!
            (testing "Non-archived cards by specific creator"
              (let [results (semantic.index/query-index {:search-string "equine"
                                                         :models ["card"]
                                                         :archived? false
                                                         :created-by [(mt/user->id :rasta)]})
                    filtered-results (filter-for-mock-embeddings results)]
                (is (pos? (count filtered-results)))
                (is (every? #(and (= "card" (:model %))
                                  (not (:archived %))
                                  (= (mt/user->id :rasta) (:creator_id %))) results))))

            (testing "Archived dashboards by multiple creators"
              (let [results (semantic.index/query-index {:search-string "Antarctic wildlife"
                                                         :models ["dashboard"]
                                                         :archived? true
                                                         :created-by [(mt/user->id :crowberto) (mt/user->id :rasta)]})
                    filtered-results (filter-for-mock-embeddings results)]
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
    (with-mocked-embeddings!
      (with-index!
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
