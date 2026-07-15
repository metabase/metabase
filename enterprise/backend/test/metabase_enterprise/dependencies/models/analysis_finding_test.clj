(ns metabase-enterprise.dependencies.models.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest upsert-analysis-clears-stale-flag-test
  (testing "upsert-analysis! sets stale to false"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {}]
        (t2/with-transaction [_conn]
          ;; Insert a finding with stale = true
          (t2/insert! :model/AnalysisFinding
                      {:analyzed_entity_type :card
                       :analyzed_entity_id   card-id
                       :analysis_version     (dec models.analysis-finding/*current-analysis-finding-version*)
                       :analyzed_at          (java.time.OffsetDateTime/now)
                       :result               true
                       :stale                true})
          ;; Verify it's stale
          (is (true? (t2/select-one-fn :stale :model/AnalysisFinding
                                       :analyzed_entity_type :card
                                       :analyzed_entity_id card-id)))
          ;; Now upsert a new analysis
          (models.analysis-finding/upsert-analysis! :card card-id true [])
          ;; Verify stale is now false
          (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id card-id))))))))

(deftest upsert-analysis-new-finding-has-stale-false-test
  (testing "upsert-analysis! creates new findings with stale = false"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {}]
        (t2/with-transaction [_conn]
          ;; Upsert a new analysis (no existing finding)
          (models.analysis-finding/upsert-analysis! :card card-id true [])
          ;; Verify stale is false
          (is (false? (t2/select-one-fn :stale :model/AnalysisFinding
                                        :analyzed_entity_type :card
                                        :analyzed_entity_id card-id))))))))

(deftest ^:sequential instances-for-analysis-serves-oldest-analyzed-first-test
  (testing "Among stale entities, instances-for-analysis returns the oldest-analyzed first."
    ;; Fairness tiebreak: the primary sort only ranks stale-before-outdated, so among equally-stale
    ;; rows the order was DB-arbitrary. A batch smaller than the stale backlog could then keep
    ;; serving the same subset, starving the rest across runs. Ordering oldest-`analyzed_at`-first
    ;; makes selection round-robin: whatever was just attempted has the newest stamp and sinks to the
    ;; back, so every stale entity is reached before any is revisited.
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding]
        (mt/with-temp [:model/Card {c1 :id} {}
                       :model/Card {c2 :id} {}
                       :model/Card {c3 :id} {}
                       :model/Card {c4 :id} {}]
          (let [base   (java.time.OffsetDateTime/of 2020 1 1 0 0 0 0 java.time.ZoneOffset/UTC)
                stale! (fn [card-id minutes]
                         (t2/insert! :model/AnalysisFinding
                                     {:analyzed_entity_type :card
                                      :analyzed_entity_id   card-id
                                      :analysis_version     models.analysis-finding/*current-analysis-finding-version*
                                      :analyzed_at          (.plusMinutes base minutes)
                                      :result               true
                                      :stale                true}))]
            ;; Insert newest-analyzed first (c4 -> c1) so the unordered scan order is the OPPOSITE of
            ;; what the tiebreak must produce: without the fix this returns [c4 c3], with it [c1 c2].
            (stale! c4 3)
            (stale! c3 2)
            (stale! c2 1)
            (stale! c1 0)
            (let [batch (models.analysis-finding/instances-for-analysis :card 2)]
              (is (= [c1 c2] (mapv :id batch))
                  "a sub-backlog batch serves the two oldest-analyzed stale cards, in ascending order"))))))))
