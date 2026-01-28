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
