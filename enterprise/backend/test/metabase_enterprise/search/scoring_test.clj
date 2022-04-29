(ns metabase-enterprise.search.scoring-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase-enterprise.search.scoring :as ee-scoring]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.search.scoring :as scoring]))

(deftest verified-score-test
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
  [search-string]
  (fn [item]
    (with-redefs [premium-features/enable-enhancements? (constantly true)]
      (-> (scoring/score-and-result search-string item) :score))))

(defn- oss-score
  [search-string]
  (fn [item]
    (with-redefs [premium-features/enable-enhancements? (constantly true)]
      (-> (scoring/score-and-result search-string item) :score))))

(deftest official-collection-tests
  (testing "it should bump up the value of items in official collections"
    ;; using the ee implementation that isn't wrapped by enable-enhancements? check
    (let [search-string     "custom expression examples"
          ee-score          (ee-score search-string)
          oss-score         (oss-score search-string)
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
        (is (> (ee-score (assoc item :collection_authority_level "official")) (ee-score item))
            (str "Item not greater for model: " (:model item))))
      (let [items (shuffle [a b c d])]
        (is (= (sort-by oss-score items)
               ;; assert that the ordering remains the same even if scores are slightly different
               (sort-by ee-score items)))
        (is (= ["customer examples of bad sorting"
                "customer success stories"
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by oss-score [a b c d]))))
        (is (= ["customer success stories"
                "customer examples of bad sorting" ;; bumped up slightly in results
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by ee-score [a b c
                                             (assoc d :collection_authority_level "official")])))))))
  (testing "It should bump up the value of verified items"
    (let [search-string     "foo"
          dashboard-count   #(assoc % :dashboardcard_count 0)
          ee-score          (comp (ee-score search-string) dashboard-count)
          oss-score          (comp (oss-score search-string) dashboard-count)
          labeled-results   {:a {:name "foobar" :model "card" :id :a}
                             :b {:name "foo foo" :model "card" :id :b}
                             :c {:name "foo foo foo" :model "card" :id :c}}
          {:keys [a b c]} labeled-results]
      (doseq [item [a b c]]
        (is (> (ee-score (assoc item :moderated_status "verified")) (ee-score item))
            (str "Item not greater for model: " (:model item))))
      (let [items (shuffle [a b c])]
        (is (= (sort-by oss-score items) (sort-by ee-score items))))
      ;; a is sorted lowest here (sort-by is ascending)
      (is (= [:a :c :b] (map :id (sort-by ee-score [a b c]))))
      ;; a is verified and is now last or highest score
      (is (= [:c :b :a]
             (map :id
                  (sort-by ee-score [(assoc a :moderated_status "verified") b c])))))))
