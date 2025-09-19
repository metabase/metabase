(ns metabase-enterprise.dependencies.task.backfill-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- backfill-existing-entities []
  (while (zero? (#'dependencies.backfill/backfill-dependencies))))

(deftest backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly updates the dependency_analysis_version"
    (backfill-existing-entities)
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
            (is (zero? (#'dependencies.backfill/backfill-dependencies)))
            (is (= 2 (card-count :dependency_analysis_version current-version)))
            ;; second run, should process the last card
            (is (= 1 (#'dependencies.backfill/backfill-dependencies)))
            (is (= 3 (card-count :dependency_analysis_version current-version)))
            ;; third run, should not process anything
            (is (= 2 (#'dependencies.backfill/backfill-dependencies)))
            (is (= 3 (card-count :dependency_analysis_version current-version)))))))))

(deftest backfill-transform-test
  (testing "Test that transforms are correctly backfilled"
    (backfill-existing-entities)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                :dependency_analysis_version 0}
                     :model/Transform {transform-id :id} {:name "Test Transform"
                                                          :source {:type "query" :query (mt/mbql-query nil {:source-table (str "card__" card-id)})}
                                                          :target {:type "table" :name "test_table"}
                                                          :dependency_analysis_version 0}]
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
        (is (t2/exists? :model/Transform :id transform-id :dependency_analysis_version 0))
        (#'dependencies.backfill/backfill-dependencies)
        (is (t2/exists? :model/Card :id card-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        (is (t2/exists? :model/Transform :id transform-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        ;; TODO: uncomment when dependency creation is implemented
        #_(is (t2/exists? :model/Dependency
                          :from_entity_type :transform :from_entity_id transform-id
                          :to_entity_type :card :to_entity_id card-id))))))

(deftest backfill-snippet-test
  (testing "Test that cards with snippets are correctly backfilled"
    (backfill-existing-entities)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my_snippet"
                                                                 :content "SELECT 1"
                                                                 :dependency_analysis_version 0}
                     :model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                :type :native
                                                                :native {:query "SELECT * FROM {{my_snippet}}"
                                                                         :template-tags
                                                                         {:my_snippet
                                                                          {:id snippet-id
                                                                           :name "my_snippet"
                                                                           :display-name "my_snippet"
                                                                           :type :snippet
                                                                           :snippet-name "my_snippet"
                                                                           :snippet-id snippet-id}}}}
                                                :dependency_analysis_version 0}]
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
        (is (t2/exists? :model/NativeQuerySnippet :id snippet-id :dependency_analysis_version 0))
        (#'dependencies.backfill/backfill-dependencies)
        (is (t2/exists? :model/Card :id card-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        (is (t2/exists? :model/NativeQuerySnippet :id snippet-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        ;; TODO: uncomment when dependency creation is implemented
        #_(is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :snippet :to_entity_id snippet-id))))))

(deftest backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (backfill-existing-entities)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                :dependency_analysis_version 0}]
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
        ;; First run
        (#'dependencies.backfill/backfill-dependencies)
        (is (t2/exists? :model/Card :id card-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        ;; Second run - should not change anything
        (#'dependencies.backfill/backfill-dependencies)
        (is (t2/exists? :model/Card :id card-id
                        :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
        ;; TODO: uncomment when dependency creation is implemented
        #_(is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :table :to_entity_id (mt/id :orders)))))))

(defn- wait-for-condition
  [predicate timeout-ms]
  (let [limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 100)
      (or (predicate)
          (when (< (System/currentTimeMillis) limit)
            (recur))))))

(deftest backfill-scheduling-test
  (testing "Test that the backfill job schedules and reschedules itself correctly"
    (backfill-existing-entities)
    (mt/with-temp-scheduler!
      (with-redefs [env/env (assoc env/env
                                   :mb-dependency-backfill-batch-size "1"
                                   :mb-dependency-backfill-delay-minutes "0"
                                   :mb-dependency-backfill-variance-minutes "0")]
        (let [card-data {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
          (mt/test-helpers-set-global-values!
            (mt/with-temp [:model/Card {card1-id :id} card-data
                           :model/Card {card2-id :id} card-data
                           :model/Card {card3-id :id} card-data]
              (let [card-count (fn [& args]
                                 (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                    current-version dependencies.model/current-dependency-analysis-version]
                (is (= 3 (card-count :dependency_analysis_version 0)))
                ;; Initialize the task, which should schedule the first run
                (task/init! ::dependencies.backfill/DependencyBackfill)
                (wait-for-condition #(= 3 (card-count :dependency_analysis_version current-version)) 10000)
                (is (= 3 (card-count :dependency_analysis_version current-version)))))))))))
