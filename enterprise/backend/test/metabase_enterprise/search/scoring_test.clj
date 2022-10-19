(ns metabase-enterprise.search.scoring-test
  (:require [cheshire.core :as json]
            [clojure.math.combinatorics :as math.combo]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase-enterprise.search.scoring :as ee-scoring]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.search.scoring :as scoring]
            [metabase.util :as u]))

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
  (with-redefs [#_{:clj-kondo/ignore [:deprecated-var]}
                premium-features/enable-enhancements? (constantly true)]
    (-> (scoring/score-and-result search-string item) :score)))

(defn- oss-score
  [search-string item]
  (with-redefs [#_{:clj-kondo/ignore [:deprecated-var]}
                premium-features/enable-enhancements? (constantly false)]
    (-> (scoring/score-and-result search-string item) :score)))

(deftest official-collection-tests
  (testing "it should bump up the value of items in official collections"
    ;; using the ee implementation that isn't wrapped by enable-enhancements? check
    (let [search-string     "custom expression examples"
          labeled-results   {:a {:name "custom expression examples" :model "dashboard"}
                             :b {:name "examples of custom expressions" :model "dashboard"}
                             :c {:name                "customer success stories"
                                 :dashboardcard_count 50
                                 :updated_at          (t/offset-date-time)
                                 :collection_position 1
                                 :model               "dashboard"}
                             :d {:name "customer examples of bad sorting" :model "dashboard"}}
          {:keys [a b c d]} labeled-results]
      (doseq [item [a b c d]]
        (is (> (ee-score search-string (assoc item :collection_authority_level "official"))
               (ee-score search-string item))
            (str "Item not greater for model: " (:model item))))
      (let [items (shuffle [a b c d])]
        (is (= (sort-by #(oss-score search-string %) items)
               ;; assert that the ordering remains the same even if scores are slightly different
               (sort-by #(ee-score search-string %) items)))
        (is (= ["customer examples of bad sorting"
                "customer success stories"
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by #(oss-score search-string %) [a b c d]))))
        (is (= ["customer success stories"
                "customer examples of bad sorting" ;; bumped up slightly in results
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by #(ee-score search-string %)
                                   [a b c
                                    (assoc d :collection_authority_level "official")])))))))
  (testing "It should bump up the value of verified items"
    (let [ss "foo"
          a {:name "foobar"
             :model "card"
             :id :a
             :dashboardcard_count 0}
          b {:name "foo foo"
             :model "card"
             :id :b
             :dashboardcard_count 0}
          c {:name "foo foo foo"
             :model "card"
             :id :c
             :dashboardcard_count 0}]
      (doseq [item [a b c]]
        (is (> (ee-score ss (assoc item :moderated_status "verified"))
               (ee-score ss item))
            (str "Item not greater for model: " (:model item))))
      (let [items (shuffle [a b c])]
        (is (= (sort-by #(oss-score ss %) items)
               (sort-by #(ee-score ss %) items))))
      (is (= [:a :c :b] (map :id (sort-by #(ee-score ss %) [a b c]))))
      ;; a is verified and is now last or highest score
      (is (= [:c :b :a]
             (map :id
                  (sort-by #(ee-score ss %)
                           [(assoc a :moderated_status "verified")
                            b
                            c])))))))

(defn- all-permutations-all-orders
  "(all-permutations-all-orders []) ;; => [[]]

   (all-permutations-all-orders [1]) ;; => [[] [1]]

   (all-permutations-all-orders [1 2])
   ;; => [[]
   ;;     [1] [2]
   ;;     [1 2] [2 1]]

   (all-permutations-all-orders [1 2 3])
   ;; => [[]
   ;;     [1]             [2]             [3]
   ;;     [1 2]   [2 1]   [1 3]   [3 1]   [2 3]   [3 2]
   ;;     [1 2 3] [1 3 2] [2 1 3] [2 3 1] [3 1 2] [3 2 1]]"
  [values]
  {:pre [(> 10 (count values))]}
  (mapv vec (mapcat math.combo/permutations (math.combo/subsets values))))

(defn- top-2-results
  "Given a reducible collection (i.e., from `jdbc/reducible-query`) and a transforming function for it, applies the
  transformation and returns a seq of the results sorted by score. The transforming function is expected to output
  maps with `:score` and `:result` keys."
  [reducible-results xf]
  (->> reducible-results (transduce xf (u/sorted-take 2 scoring/compare-score-and-result)) rseq (map #(update % :score double))))

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
             (-> results
                 (top-2-results (map #(metabase.search.scoring/score-and-result search-string %)))
                 first
                 :result
                 :name))))))

(deftest identical-results-result-in-identical-hits
  (test-corups ["foo" "bar"])
  (test-corups ["foo" "bar" "baz"])
  (test-corups ["foo" "bar" "baz" "quux"]))
