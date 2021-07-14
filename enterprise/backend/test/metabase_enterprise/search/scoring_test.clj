(ns metabase-enterprise.search.scoring-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase-enterprise.search.scoring :as ee-scoring]
            [metabase.search.scoring :as scoring]))

(deftest official-collection-tests
  (testing "it should bump up the value of items in official collections"
    ;; using the ee implementation that isn't wrapped by enable-enhancements? check
    (let [search-string     "custom expression examples"
          ee-score          (comp :score (partial scoring/score-and-result ee-scoring/scoring-impl search-string))
          os-score          (comp :score (partial scoring/score-and-result scoring/oss-score-impl search-string))
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
        (is (= (sort-by os-score items)
               ;; assert that the ordering remains the same even if scores are slightly different
               (sort-by ee-score items)))
        (is (= ["customer examples of bad sorting"
                "customer success stories"
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by os-score [a b c d]))))
        (is (= ["customer success stories"
                "customer examples of bad sorting" ;; bumped up slightly in results
                "examples of custom expressions"
                "custom expression examples"]
               (map :name (sort-by ee-score [a b c
                                             (assoc d :collection_authority_level "official")]))))))))
