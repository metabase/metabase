(ns metabase-enterprise.dependencies.models.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CyclicBarrier TimeUnit)))

(set! *warn-on-reflection* true)

(defn- finding [card-id]
  (t2/select-one :model/AnalysisFinding :entity_type :card :entity_id card-id))

(defn- status [card-id]
  (t2/select-one :model/AnalysisFindingStatus :entity_type :card :entity_id card-id))

(deftest upsert-analysis-records-version-test
  (testing "upsert-analysis! records the version it is given in the status, and keeps the recorded one when given none"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingStatus]
        (mt/with-temp [:model/Card {card-id :id} {}]
          (models.analysis-finding/upsert-analysis! :card card-id true [] 7)
          (is (=? {:result true} (finding card-id)))
          (is (=? {:entity_version   7
                   :analysis_version models.analysis-finding/*current-analysis-finding-version*}
                  (status card-id)))
          (models.analysis-finding/upsert-analysis! :card card-id false [] nil)
          (is (=? {:result false} (finding card-id)))
          (is (=? {:entity_version 7} (status card-id))))))))

(deftest ^:synchronized analysis-finding-pending-entities-test
  (testing "the analysis job picks the entities without a status, analyzed at another version, or by an older analysis,
           changed ones first, and only once their dependencies are current"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingStatus :model/DependencyStatus]
        (mt/with-temp [:model/Card {unanalyzed :id} {}
                       :model/Card {current :id}    {}
                       :model/Card {outdated :id}   {}
                       :model/Card {changed :id}    {}
                       :model/Card {blocked :id}    {}]
          (let [ids      #{unanalyzed current outdated changed blocked}
                selected #(into [] (comp (map :id) (filter ids))
                                (dependencies.db/analysis-finding-pending-entities
                                 :card 100000 models.analysis-finding/*current-analysis-finding-version*
                                 models.dependency/current-dependency-analysis-version true))]
            (doseq [card-id (disj ids blocked)]
              (dependencies.db/upsert-dependency-status!
               :card card-id models.dependency/current-dependency-analysis-version 1))
            (models.analysis-finding/upsert-analysis! :card current true [] 1)
            (models.analysis-finding/upsert-analysis! :card changed true [] 1)
            (binding [models.analysis-finding/*current-analysis-finding-version*
                      (dec models.analysis-finding/*current-analysis-finding-version*)]
              (models.analysis-finding/upsert-analysis! :card outdated true [] 1))
            (t2/update! :model/Card changed {:name "Renamed"})
            (dependencies.db/upsert-dependency-status!
             :card changed models.dependency/current-dependency-analysis-version 2)
            (let [picked (selected)]
              (is (= #{unanalyzed changed} (set (butlast picked))))
              (is (= outdated (last picked))))))))))

(deftest ^:synchronized concurrent-upserts-test
  (testing "two analyses of an entity inserting its finding at once leave the finding they found, not an insert error"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding :model/AnalysisFindingError]
          (mt/with-temp [:model/Card {card-id :id} {}]
            (let [barrier (CyclicBarrier. 2)
                  insert! (mt/original-fn #'dependencies.db/insert-finding!)]
              (mt/with-dynamic-fn-redefs [dependencies.db/insert-finding! (fn [row]
                                                                            (.await barrier 10 TimeUnit/SECONDS)
                                                                            (insert! row))]
                (let [upserts (repeatedly 2 #(future (models.analysis-finding/upsert-analysis! :card card-id true [] nil)))]
                  (run! deref (doall upserts))))
              (is (=? {:result true} (finding card-id)))
              (is (zero? (t2/count :model/AnalysisFindingError :analyzed_entity_type "card"
                                   :analyzed_entity_id card-id))))))))))
