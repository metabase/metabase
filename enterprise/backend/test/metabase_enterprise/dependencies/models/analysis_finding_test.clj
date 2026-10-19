(ns metabase-enterprise.dependencies.models.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.test :as mt]
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
                                 :card 100000 version models.dependency/current-dependency-analysis-version))]
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
  (testing "two analyses of an entity inserting its finding at once leave the finding they found, not an insert error"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
          (mt/with-temp [:model/Card {card-id :id} {}]
            (let [barrier (CyclicBarrier. 2)
                  insert! (mt/original-fn #'t2/insert-returning-pk!)]
              (mt/with-dynamic-fn-redefs [t2/insert-returning-pk! (fn [model & args]
                                                                    (when (= :model/AnalysisFinding model)
                                                                      (.await barrier 10 TimeUnit/SECONDS))
                                                                    (apply insert! model args))]
                (let [upserts (repeatedly 2 #(future (models.analysis-finding/upsert-analysis! :card card-id true #{})))]
                  (run! deref (doall upserts))))
              (is (=? {:result true} (finding card-id)))
              (is (zero? (t2/count :model/AnalysisFindingError :analyzed_entity_type "card"
                                   :analyzed_entity_id card-id))))))))))
