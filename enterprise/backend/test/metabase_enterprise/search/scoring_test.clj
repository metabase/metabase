(ns metabase-enterprise.search.scoring-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.search.scoring :as ee-scoring]
            [metabase.search.scoring :as scoring]))

(deftest official-collection-tests
  (testing "it should bump up the value of items in official collections"
    ;; using the ee implementation that isn't wrapped by enable-enhancements? check
    (let [score          (comp :score (partial scoring/score-and-result ee-scoring/scoring-impl ""))
          items          [{:name                "needle"
                           :dashboardcard_count 0
                           :model               "card"}
                          {:name  "foo"
                           :model "dashboard"}
                          {:name  "foo2"
                           :model "pulse"}]]
      (doseq [item items]
        (is (> (score (assoc item :collection_authority_level "official")) (score item))
            (str "Item not greater for model: " (:model item))))
      (doseq [item items]
        (is (= (score item)
               ((comp :score (partial scoring/score-and-result scoring/oss-score-impl ""))
                item)))))))
