(ns metabase-enterprise.search.scoring-test
  (:require
   [cheshire.core :as json]
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.search.scoring :as ee-scoring]
   [metabase.search.scoring :as scoring]
   [metabase.test :as mt]))

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
    ;; using the ee implementation that isn't wrapped by enable-enhancements? check
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

(defn test-corups [words]
  (let [corpus (->> words
                    all-permutations-all-orders
                    (mapv #(str/join " " %))
                    (remove #{""}))
        the-query (json/generate-string {:type :query :query {:source-table 1}})
        ->query (fn [n] {:name n :dataset_query the-query})
        results (map ->query corpus)]
    (doseq [search-string corpus]
      (is (= search-string
             (-> (scoring/top-results
                  results
                  1
                  (map #(scoring/score-and-result % {:search-string search-string})))
                 first
                 :name))))))

(deftest identical-results-result-in-identical-hits
  (test-corups ["foo" "bar"])
  (test-corups ["foo" "bar" "baz"])
  (test-corups ["foo" "bar" "baz" "quux"]))

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
