(ns metabase-enterprise.similarity.views.direct-dependency-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential projects-dependency-rows-as-edges-test
  (testing "every dependency row produces a :direct-dependency edge with score 1.0"
    (mt/with-premium-features #{:similarity-graph}
      (mt/with-model-cleanup [:model/Card :model/Dependency
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/Card {card-a :id} {}
                       :model/Card {card-b :id} {}]
          (t2/insert! :model/Dependency
                      [{:from_entity_type :card :from_entity_id card-a
                        :to_entity_type   :card :to_entity_id   card-b}
                       {:from_entity_type :card :from_entity_id card-a
                        :to_entity_type   :table :to_entity_id  (mt/id :orders)}])
          (let [result (runner/run-view! :direct-dependency)
                edges  (t2/select :model/SimilarEdge
                                  :view :direct-dependency
                                  :from_entity_id card-a)]
            (is (= :ok (:status result)))
            (is (>= (count edges) 2)
                "should have at least the two we inserted")
            (is (every? #(= 1.0 (:score %)) edges))
            (testing "card→card edge present"
              (let [c2c (some #(when (and (= :card (:to_entity_type %))
                                          (= card-b (:to_entity_id %)))
                                 %)
                              edges)]
                (is (some? c2c))
                (is (= {:source "dependency" :metric nil}
                       (:contributing_data c2c)))))
            (testing "card→table edge present (cross-type)"
              (is (some #(and (= :table (:to_entity_type %))
                              (= (mt/id :orders) (:to_entity_id %)))
                        edges)))))))))

(deftest ^:sequential idempotent-rebuild-test
  (testing "running twice in a row produces the same row count for the view"
    (mt/with-premium-features #{:similarity-graph}
      (mt/with-model-cleanup [:model/Card :model/Dependency
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/Card {card-a :id} {}
                       :model/Card {card-b :id} {}]
          (t2/insert! :model/Dependency
                      {:from_entity_type :card :from_entity_id card-a
                       :to_entity_type   :card :to_entity_id   card-b})
          (let [run-1 (:inserted (runner/run-view! :direct-dependency))
                run-2 (:inserted (runner/run-view! :direct-dependency))]
            (is (= run-1 run-2))))))))
