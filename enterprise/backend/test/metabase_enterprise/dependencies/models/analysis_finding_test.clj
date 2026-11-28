(ns metabase-enterprise.dependencies.models.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as models.analysis-finding-error]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CyclicBarrier TimeUnit)))

(set! *warn-on-reflection* true)

(defn- finding [card-id]
  (t2/select-one :model/AnalysisFinding :entity_type :card :entity_id card-id))

(deftest ^:synchronized take-pending-analysis-finding-statuses-test
  (testing "the analysis job takes the entities without a status, with one counting a write or one of an older
           analysis, the last ones last, only once their dependencies are current, and inserts the missing statuses
           counting one write"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingStatus :model/DependencyStatus]
        (mt/with-temp [:model/Card {unanalyzed :id} {}
                       :model/Card {current :id}    {}
                       :model/Card {outdated :id}   {}
                       :model/Card {changed :id}    {}
                       :model/Card {blocked :id}    {}]
          (let [ids      #{unanalyzed current outdated changed blocked}
                version  models.analysis-finding/*current-analysis-finding-version*
                selected #(into [] (filter (comp ids :entity_id))
                                (dependencies.db/take-pending-analysis-finding-statuses!
                                 :card 100000 version models.dependency/current-dependency-analysis-version {}))]
            (doseq [card-id (disj ids blocked)]
              (deps.test/record-dependencies-computed! :card card-id))
            (doseq [card-id [current changed]]
              (deps.test/record-status-processed! :model/AnalysisFindingStatus :card card-id version))
            (deps.test/record-status-processed! :model/AnalysisFindingStatus :card outdated (dec version))
            (dependencies.db/mark-analysis-finding-statuses-stale! {:card #{changed}})
            (let [picked (selected)]
              (is (= #{{:entity_id unanalyzed :stale 1} {:entity_id changed :stale 1}} (set (butlast picked))))
              (is (= {:entity_id outdated :stale 0} (last picked)))
              (is (= 1 (t2/select-one-fn :stale :model/AnalysisFindingStatus :entity_type :card
                                         :entity_id unanalyzed))))))))))

(deftest ^:synchronized concurrent-upserts-test
  (testing "analyses of an entity upserting its finding at once leave one finding, not an insert error"
    (when-not (= :h2 (mdb/db-type))
      (mt/test-helpers-set-global-values!
        (mt/with-premium-features #{:dependencies}
          (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
            (mt/with-temp [:model/Card {card-id :id} {}]
              (let [threads 4
                    barrier (CyclicBarrier. threads)
                    upserts (doall (repeatedly threads
                                               #(future
                                                  (.await barrier 10 TimeUnit/SECONDS)
                                                  (models.analysis-finding/upsert-analysis! :card card-id true #{}))))]
                (run! deref upserts)
                (is (=? {:result true} (finding card-id)))
                (is (= 1 (t2/count :model/AnalysisFinding :entity_type :card :entity_id card-id)))
                (is (zero? (t2/count :model/AnalysisFindingError :analyzed_entity_type "card"
                                     :analyzed_entity_id card-id)))))))))))

(deftest ^:synchronized malformed-source-id-does-not-break-the-finding-insert-test
  (testing "an error naming a non-integer source (unchecked in prod) is recorded without the source (GHY-4956)"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
        (mt/with-temp [:model/Card {cid :id} {}]
          (mu/disable-enforcement
            (models.analysis-finding/upsert-analysis! :card cid false
                                                      #{{:type :missing-card, :name "card__1"
                                                         :source-entity-type :card, :source-entity-id "card__1"}}))
          (is (=? [{:error_type :missing-card, :source_entity_type nil, :source_entity_id nil}]
                  (models.analysis-finding-error/errors-for-entity :card cid))))))))
