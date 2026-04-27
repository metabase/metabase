(ns metabase-enterprise.similarity.views.co-dashboard-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- jaccard [a b]
  (let [s-a (set a) s-b (set b)
        i (count (set/intersection s-a s-b))
        u (count (set/union s-a s-b))]
    (when (pos? u)
      (/ (double i) u))))

(defn- edge-between [card-x card-y]
  (t2/select-one :model/SimilarEdge
                 :view :co-dashboard
                 :from_entity_type :card :from_entity_id card-x
                 :to_entity_type   :card :to_entity_id   card-y))

(deftest ^:sequential pairwise-jaccard-and-symmetry-test
  (testing "Jaccard scores are correct and edges are stored in both directions"
    (mt/with-premium-features #{:similarity-graph}
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/Card      {ca :id} {}
                       :model/Card      {cb :id} {}
                       :model/Card      {cc :id} {}
                       :model/Dashboard {d1 :id} {}
                       :model/Dashboard {d2 :id} {}
                       :model/Dashboard {d3 :id} {}
                       ;; A on dashboards 1, 2, 3
                       :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                       :model/DashboardCard _ {:dashboard_id d2 :card_id ca}
                       :model/DashboardCard _ {:dashboard_id d3 :card_id ca}
                       ;; B on dashboards 2, 3
                       :model/DashboardCard _ {:dashboard_id d2 :card_id cb}
                       :model/DashboardCard _ {:dashboard_id d3 :card_id cb}
                       ;; C on dashboard 1
                       :model/DashboardCard _ {:dashboard_id d1 :card_id cc}]
          (let [result (runner/run-view! :co-dashboard)]
            (is (= :ok (:status result))))
          (testing "(A, B): intersection 2, union 3 ⇒ 2/3"
            (let [edge (edge-between ca cb)]
              (is (some? edge))
              (is (== (jaccard #{d1 d2 d3} #{d2 d3}) (:score edge)))))
          (testing "symmetry: (B, A) is also stored with the same score"
            (let [a->b (edge-between ca cb)
                  b->a (edge-between cb ca)]
              (is (some? b->a))
              (is (= (:score a->b) (:score b->a)))))
          (testing "(A, C): intersection 1, union 3 ⇒ 1/3"
            (let [edge (edge-between ca cc)]
              (is (some? edge))
              (is (== (jaccard #{d1 d2 d3} #{d1}) (:score edge)))))
          (testing "(B, C): no shared dashboards ⇒ no edge"
            (is (nil? (edge-between cb cc)))
            (is (nil? (edge-between cc cb)))))))))

(deftest ^:sequential archived-cards-excluded-test
  (testing "archived cards do not produce edges"
    (mt/with-premium-features #{:similarity-graph}
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                              :model/SimilarEdge :model/SimilarEdgeStatus]
        (mt/with-temp [:model/Card      {ca :id} {:archived true}
                       :model/Card      {cb :id} {}
                       :model/Dashboard {d1 :id} {}
                       :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                       :model/DashboardCard _ {:dashboard_id d1 :card_id cb}]
          (runner/run-view! :co-dashboard)
          (is (nil? (edge-between ca cb)))
          (is (nil? (edge-between cb ca))))))))
