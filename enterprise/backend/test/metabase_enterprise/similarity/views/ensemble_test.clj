(ns metabase-enterprise.similarity.views.ensemble-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.fusion :as fusion]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- ensemble-edge [from-id to-id]
  (t2/select-one :model/SimilarEdge
                 :view :ensemble
                 :from_entity_type :card :from_entity_id from-id
                 :to_entity_type   :card :to_entity_id   to-id))

(deftest ^:sequential ensemble-fuses-base-view-rows-test
  (testing "ensemble row exists for any pair seen in any base view, ranked by fused score"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                            :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card      {ca :id} {}
                     :model/Card      {cb :id} {}
                     :model/Card      {cc :id} {}
                     :model/Dashboard {d1 :id} {}
                     :model/Dashboard {d2 :id} {}
                     ;; A and B share two dashboards (high overlap)
                     :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                     :model/DashboardCard _ {:dashboard_id d2 :card_id ca}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cb}
                     :model/DashboardCard _ {:dashboard_id d2 :card_id cb}
                     ;; A and C share one dashboard (lower overlap)
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cc}]
        ;; Run the only base view that has data for these fixtures.
        (runner/run-view! :co-dashboard)
        (let [{:keys [status inserted]} (runner/run-view! :ensemble)]
          (is (= :ok status))
          (is (pos? inserted)))
        (testing "fused score (A, B) > fused score (A, C)"
          (let [ab (ensemble-edge ca cb)
                ac (ensemble-edge ca cc)]
            (is (some? ab))
            (is (some? ac))
            (is (> (:score ab) (:score ac)))))
        (testing "fused rows record :view :ensemble and a numeric score"
          (let [ab (ensemble-edge ca cb)]
            (is (= :ensemble (:view ab)))
            (is (number? (:score ab)))))))))

(deftest ^:sequential multi-view-fusion-boosts-shared-pairs-test
  (testing "a pair that appears in two views fuses higher than a pair that appears in only one"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                            :model/Dependency
                            :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card      {ca :id} {}
                     :model/Card      {cb :id} {}
                     :model/Card      {cc :id} {}
                     :model/Dashboard {d1 :id} {}
                     ;; A and B co-occur on a dashboard AND are in the dependency table.
                     :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cb}
                     ;; A and C only co-occur on the dashboard.
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cc}]
        (t2/insert! :model/Dependency
                    [{:from_entity_type :card :from_entity_id ca
                      :to_entity_type   :card :to_entity_id   cb}])
        (runner/run-view! :co-dashboard)
        (runner/run-view! :direct-dependency)
        (runner/run-view! :ensemble)
        (let [ab (ensemble-edge ca cb)
              ac (ensemble-edge ca cc)]
          (is (some? ab))
          (is (some? ac))
          (is (> (:score ab) (:score ac))
              "AB benefits from two views; AC only from one"))))))

(deftest ^:sequential top-k-per-source-cap-test
  (testing "ensemble caps each source at top-k-per-source rows"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      ;; Force a tiny cap so we can reach it without 51 fixtures.
      (with-redefs [fusion/ensemble-config
                    (constantly
                     {[:card :card]
                      {:views            [:co-dashboard]
                       :weights          {}
                       :k                60
                       :top-k-per-source 3}})]
        (let [src 8001]
          (doseq [to (range 9001 9011)]
            (t2/insert! :model/SimilarEdge
                        {:from_entity_type :card :from_entity_id src
                         :to_entity_type   :card :to_entity_id   to
                         :view             :co-dashboard
                         :score            (double (- 9011 to))    ; higher score for lower id
                         :last_computed_at (java.time.OffsetDateTime/now)}))
          (runner/run-view! :ensemble)
          (let [rows (t2/select :model/SimilarEdge
                                :view :ensemble
                                :from_entity_type :card :from_entity_id src)]
            (is (= 3 (count rows)))
            (testing "the survivors are the highest-scored neighbors"
              (is (= #{9001 9002 9003} (set (map :to_entity_id rows)))))))))))

(deftest ^:sequential idempotent-rebuild-test
  (testing "running :ensemble twice is a no-op on row count and per-row scores"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                            :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card      {ca :id} {}
                     :model/Card      {cb :id} {}
                     :model/Dashboard {d1 :id} {}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cb}]
        (runner/run-view! :co-dashboard)
        (let [run-1 (:inserted (runner/run-view! :ensemble))
              edge-1 (ensemble-edge ca cb)
              run-2 (:inserted (runner/run-view! :ensemble))
              edge-2 (ensemble-edge ca cb)]
          (is (= run-1 run-2))
          (is (== (:score edge-1) (:score edge-2))))))))

(deftest ^:sequential cold-ensemble-no-base-rows-test
  (testing "ensemble runs cleanly when there are no base rows for the typed pair"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [{:keys [status inserted]} (runner/run-view! :ensemble)]
        (is (= :ok status))
        (is (zero? inserted))))))

(deftest ^:sequential contributing-data-nil-on-phase-3-test
  (testing "Phase 3 leaves :contributing_data nil; pinned so Phase 6 has to opt in"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard
                            :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card      {ca :id} {}
                     :model/Card      {cb :id} {}
                     :model/Dashboard {d1 :id} {}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id ca}
                     :model/DashboardCard _ {:dashboard_id d1 :card_id cb}]
        (runner/run-view! :co-dashboard)
        (runner/run-view! :ensemble)
        (let [edge (ensemble-edge ca cb)]
          (is (some? edge))
          (is (nil? (:contributing_data edge))))))))
