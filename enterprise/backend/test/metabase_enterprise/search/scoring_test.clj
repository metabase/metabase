(ns metabase-enterprise.search.scoring-test
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.search.scoring :as ee-scoring]
   [metabase.search.appdb.scoring-test :as appdb.scoring-test]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import [java.time Instant]))

(set! *warn-on-reflection* true)

(deftest ^:parallel verified-score-test
  (let [score #'ee-scoring/verified-score
        item  (fn [id status] {:moderated_status status
                               :id               id
                               :model            "card"})
        score (fn [items] (into [] (map :id) (reverse (sort-by score items))))]
    (testing "verification bumps result"
      ;; stable sort all with score 0 and then reverse to get descending rather than ascending
      (is (= [3 2 1] (score [(item 1 nil) (item 2 nil) (item 3 nil)])))
      ;; verified item is promoted
      (is (= [1 3 2] (score [(item 1 "verified") (item 2 nil) (item 3 nil)]))))))

(defn- ee-score
  [search-string item]
  (mt/with-premium-features #{:official-collections :content-verification}
    (-> (scoring/score-and-result item {:search-string search-string}) :score)))

(defn- oss-score
  [search-string item]
  (mt/with-premium-features #{}
    (-> (scoring/score-and-result item {:search-string search-string}) :score)))

(deftest official-collection-tests
  (testing "it should bump up the value of items in official collections"
    ;; using the ee implementation that isn't wrapped by premium features token check
    (let [search-string "custom expression examples"
          a             {:id "a" :name "custom expression examples" :model "dashboard"}
          b             {:id "b" :name "examples of custom expressions" :model "dashboard"}
          c             {:id "c"
                         :name                "customer success stories"
                         :dashboardcard_count 50
                         :updated_at          (t/offset-date-time)
                         :collection_position 1
                         :model               "dashboard"}
          d             {:id "d" :name "customer examples of bad sorting" :model "dashboard"}]
      (doseq [item [a b c d]]
        (is (> (ee-score search-string (assoc item :collection_authority_level "official"))
               (ee-score search-string item))
            (str "On EE, should be greater for item: " item " vs " (assoc item :collection_authority_level "official")))
        (is (= (oss-score search-string (assoc item :collection_authority_level "official"))
               (oss-score search-string item))
            (str "On OSS, should be the same for item: " item " vs " (assoc item :collection_authority_level "official"))))
      (is (= ["customer examples of bad sorting"
              "customer success stories"
              "examples of custom expressions"
              "custom expression examples"]
             (mapv :name (sort-by #(oss-score search-string %)
                                  (shuffle [a b c d])))))
      (is (= ["customer examples of bad sorting"
              "customer success stories"
              "examples of custom expressions"
              "custom expression examples"]
             (mapv :name (sort-by #(ee-score search-string %)
                                  (shuffle [a b c (assoc d :collection_authority_level "official")])))))))
  (testing "It should bump up the value of verified items"
    (let [ss "foo"
          a  {:name                "foobar"
              :model               "card"
              :id                  :a
              :dashboardcard_count 0}
          b  {:name                "foo foo"
              :model               "card"
              :id                  :b
              :dashboardcard_count 0}
          c  {:name                "foo foo foo"
              :model               "card"
              :id                  :c
              :dashboardcard_count 0}]
      (doseq [item [a b c]]
        (is (> (ee-score ss (assoc item :moderated_status "verified"))
               (ee-score ss item))
            (str "Item not greater for model: " (:model item))))
      (let [items (shuffle [a b c])]
        (is (= (sort-by #(oss-score ss %) items)
               (sort-by #(ee-score ss %) items))))
      (is (= [:c :b :a] (map :id (sort-by #(ee-score ss %) [a b c]))))
      ;; c is verified and is now last or highest score
      (is (= [:b :a :c]
             (map :id
                  (sort-by #(ee-score ss %)
                           [a
                            b
                            (assoc c :moderated_status "verified")])))))))

(defn- all-permutations-all-orders
  "(all-permutations-all-orders [1]) ;; => [[] [1]]
   (all-permutations-all-orders [1 2])
   ;; => [[] [1] [2] [1 2] [2 1]]
   (all-permutations-all-orders [1 2 3])
   ;; => [[]                                               ;; size 0
   ;;     [1]             [2]             [3]              ;; size 1
   ;;     [1 2]   [2 1]   [1 3]   [3 1]   [2 3]   [3 2]    ;; size 2
   ;;     [1 2 3] [1 3 2] [2 1 3] [2 3 1] [3 1 2] [3 2 1]] ;; size 3
  "
  [values]
  {:pre [(> 10 (count values))]}
  (mapv vec (mapcat math.combo/permutations (math.combo/subsets values))))

(defn test-corpus [words]
  (let [corpus (->> words
                    all-permutations-all-orders
                    (mapv #(str/join " " %))
                    (remove #{""}))
        the-query (json/encode {:type :query :query {:source-table 1}})
        ->query (fn [n] {:name n :dataset_query the-query})
        results (map ->query corpus)]
    (doseq [search-string corpus]
      (is (= search-string
             (-> (scoring/top-results
                  results
                  1
                  (keep #(scoring/score-and-result % {:search-string search-string})))
                 first
                 :name))))))

(deftest identical-results-result-in-identical-hits
  (test-corpus ["foo" "bar"])
  (test-corpus ["foo" "bar" "baz"])
  (test-corpus ["foo" "bar" "baz" "quux"]))

(deftest score-result-test
  (let [score-result-names (fn [] (set (map :name (scoring/score-result {}))))]
    (testing "does not include scores for official collection or verified if features are disabled"
      (mt/with-premium-features #{}
        (is (= #{}
               (set/intersection #{"official collection score" "verified"}
                                 (score-result-names))))))

    (testing "includes official collection score if :official-collections is enabled"
      (mt/with-premium-features #{:official-collections}
        (is (set/subset? #{"official collection score"} (score-result-names)))))

    (testing "includes verified if :content-verification is enabled"
      (mt/with-premium-features #{:content-verification}
        (is (set/subset? #{"verified"} (score-result-names)))))

    (testing "includes both if has both features"
      (mt/with-premium-features #{:official-collections :content-verification}
        (is (set/subset? #{"official collection score" "verified"} (score-result-names)))))))

(deftest appdb-official-collection-test
  (appdb.scoring-test/with-index-contents
    [{:model "collection" :id 1 :name "collection normal" :official_collection false}
     {:model "collection" :id 2 :name "collection official" :official_collection true}]
    (testing "official collections has higher rank"
      (mt/with-premium-features #{:official-collections}
        (is (= [["collection" 2 "collection official"]
                ["collection" 1 "collection normal"]]
               (appdb.scoring-test/search-results :official-collection "collection")))))
    (testing "only if feature is enabled"
      (mt/with-premium-features #{}
        (is (= [["collection" 1 "collection normal"]
                ["collection" 2 "collection official"]]
               (appdb.scoring-test/search-results* "collection")))))))

(deftest appdb-verified-test
  (appdb.scoring-test/with-index-contents
    [{:model "card" :id 1 :name "card normal" :verified false}
     {:model "card" :id 2 :name "card verified" :verified true}]
    (testing "verified items have higher rank"
      (mt/with-premium-features #{:content-verification}
        (is (= [["card" 2 "card verified"]
                ["card" 1 "card normal"]]
               (appdb.scoring-test/search-results :verified "card")))))
    (testing "only if feature is enabled"
      (mt/with-premium-features #{}
        (is (= [["card" 1 "card normal"]
                ["card" 2 "card verified"]]
               (appdb.scoring-test/search-results* "card")))))))

(deftest transforms-user-recency-test
  (mt/with-premium-features #{:transforms}
    (let [user-id (mt/user->id :crowberto)
          now     (Instant/now)
          recent-view (fn [model-id timestamp]
                        {:model     "card"
                         :model_id  model-id
                         :user_id   user-id
                         :timestamp timestamp})]
      (mt/with-temp [:model/Card        {c1 :id} {}
                     :model/Card        {c2 :id} {}
                     :model/Transform   {t1 :id} {:name "test transform"
                                                  :source {:type "query"
                                                           :query (mt/native-query {:query "SELECT 1"})}
                                                  :target {:type "table"
                                                           :name "test_table"}}
                     :model/RecentViews _ (recent-view c1 now)]
        (appdb.scoring-test/with-index-contents
          [{:model "card"      :id c1 :name "test card recent"}
           {:model "card"      :id c2 :name "test card unseen"}
           {:model "transform" :id t1 :name "test transform" :source_type "mbql"}]
          (testing "Transforms get a hardcoded 1-day recency (between recently viewed card and never viewed card)"
            (is (= [["card"      c1 "test card recent"]
                    ["transform" t1 "test transform"]
                    ["card"      c2 "test card unseen"]]
                   (appdb.scoring-test/search-results :user-recency "test" {:current-user-id user-id
                                                                            :context :metabot})))))))))
