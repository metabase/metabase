(ns metabase-enterprise.dependencies.task.backfill-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly updates the dependency_analysis_version"
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (let [query (mt/mbql-query orders)]
        (mt/with-temp [:model/Card {card1-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card2-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card3-id :id} {:dependency_analysis_version 0, :dataset_query query}]
          (let [card-count (fn [& args]
                             (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                current-version dependencies.model/current-dependency-analysis-version]
            (is (= 3 (card-count)))
            ;; first run, should process 2 cards
            (#'dependencies.backfill/backfill-dependencies)
            (is (= 2 (card-count :dependency_analysis_version current-version)))
            ;; second run, should process the last card
            (#'dependencies.backfill/backfill-dependencies)
            (is (= 3 (card-count :dependency_analysis_version current-version)))
            ;; third run, should not process anything
            (#'dependencies.backfill/backfill-dependencies)
            (is (= 3 (card-count :dependency_analysis_version current-version)))))))))
