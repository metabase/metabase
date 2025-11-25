(ns metabase-enterprise.dependencies.task.backfill-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase-enterprise.dependencies.task.test-util :as dependencies.task.tu]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly updates the dependency_analysis_version"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (let [query (mt/mbql-query orders)]
        (mt/with-premium-features #{}
          (mt/with-temp [:model/Card {card1-id :id} {:dependency_analysis_version 0, :dataset_query query}
                         :model/Card {card2-id :id} {:dependency_analysis_version 0, :dataset_query query}
                         :model/Card {card3-id :id} {:dependency_analysis_version 0, :dataset_query query}]
            (let [card-count (fn [& args]
                               (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                  current-version dependencies.model/current-dependency-analysis-version]
              (is (= 3 (card-count)))
              ;; first run, should process 2 cards
              (is (true? (dependencies.task.tu/backfill-dependencies-single-trigger!)))
              (is (= 2 (card-count :dependency_analysis_version current-version)))
              ;; second run, should process the last card
              (is (false? (dependencies.task.tu/backfill-dependencies-single-trigger!)))
              (is (= 3 (card-count :dependency_analysis_version current-version)))
              ;; third run, should not process anything
              (is (false? (dependencies.task.tu/backfill-dependencies-single-trigger!)))
              (is (= 3 (card-count :dependency_analysis_version current-version))))))))))

(deftest ^:sequential backfill-transform-test
  (testing "Test that transforms are correctly backfilled"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                  :dependency_analysis_version 0}
                       :model/Transform {transform-id :id} {:name "Test Transform"
                                                            :source {:type "query"
                                                                     :query (mt/mbql-query nil
                                                                              {:source-table (str "card__" card-id)})}
                                                            :target {:type "table" :name "test_table"}
                                                            :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (t2/exists? :model/Transform :id transform-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card      :from_entity_id card-id)))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :transform :from_entity_id transform-id)))
          (dependencies.task.tu/backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Transform :id transform-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :table :to_entity_id (mt/id :orders)))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :transform :from_entity_id transform-id
                          :to_entity_type :card :to_entity_id card-id)))))))

(deftest ^:sequential backfill-snippet-test
  (testing "Test that cards with snippets are correctly backfilled"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my_snippet"
                                                                   :content "SELECT 1"
                                                                   :dependency_analysis_version 0}
                       :model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                  :type :native
                                                                  :native {:query "SELECT * FROM {{my_snippet}}"
                                                                           :template-tags
                                                                           {:my_snippet
                                                                            {:id (str (random-uuid))
                                                                             :name "my_snippet"
                                                                             :display-name "my_snippet"
                                                                             :type :snippet
                                                                             :snippet-name "my_snippet"
                                                                             :snippet-id snippet-id}}}}
                                                  :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (t2/exists? :model/NativeQuerySnippet :id snippet-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency
                                  :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :snippet :to_entity_id snippet-id)))
          (dependencies.task.tu/backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/NativeQuerySnippet :id snippet-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :snippet :to_entity_id snippet-id)))))))

(deftest ^:sequential backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                  :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :table :to_entity_id (mt/id :orders))))
          ;; First run
          (dependencies.task.tu/backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          ;; Second run - should not change anything
          (dependencies.task.tu/backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :table :to_entity_id (mt/id :orders))))))))

(deftest ^:sequential backfill-scheduling-test
  (testing "Test that the backfill job schedules and reschedules itself correctly"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (mt/with-temp-scheduler!
      (with-redefs [env/env (assoc env/env
                                   :mb-dependency-backfill-batch-size "1"
                                   :mb-dependency-backfill-delay-minutes "0"
                                   :mb-dependency-backfill-variance-minutes "0")]
        (let [card-data {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
          (mt/test-helpers-set-global-values!
            (mt/with-premium-features #{}
              (mt/with-temp [:model/Card {card1-id :id} card-data
                             :model/Card {card2-id :id} card-data
                             :model/Card {card3-id :id} card-data]
                (let [card-count (fn [& args]
                                   (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                      current-version dependencies.model/current-dependency-analysis-version]
                  (is (= 3 (card-count :dependency_analysis_version 0)))
                  (mt/with-premium-features #{:dependencies}
                    ;; Initialize the task, which should schedule the first run
                    (task/init! ::dependencies.backfill/DependencyBackfill)
                    (dependencies.task.tu/wait-for-condition
                     #(= 3 (card-count :dependency_analysis_version current-version))
                     10000)
                    (is (= 3 (card-count :dependency_analysis_version current-version)))))))))))))

(deftest ^:sequential backfill-terminal-failure-test
  (testing "Entities should be marked as terminally broken after MAX_RETRIES failures"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

        (let [update-attempts (volatile! 0)
              failures (inc @#'dependencies.backfill/max-retries)]
          (with-redefs [env/env (assoc env/env
                                       :mb-dependency-backfill-delay-minutes "0"
                                       :mb-dependency-backfill-variance-minutes "0")
                        t2/update! (fn [model-kw id & args]
                                     (if (and (= model-kw :model/Card)
                                              (= id card-id)
                                              (< @update-attempts failures))
                                       (do
                                         (vswap! update-attempts inc)
                                         (throw (ex-info "Simulated DB error" {:id id})))
                                       (apply t2/update! model-kw id args)))]
            ;; fail MAX_RETRIES + 1 times
            (while (< @update-attempts failures)
              (dependencies.task.tu/backfill-dependencies-single-trigger!))))

        ;; verify card is not processed and is terminally broken
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

        ;; verify subsequent runs don't process it
        (dependencies.task.tu/backfill-dependencies-single-trigger!)
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))))))

(deftest ^:sequential backfill-delayed-retry-test
  (testing "Failed entities should be retried after their delay period expires"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (let [current-version dependencies.model/current-dependency-analysis-version
          update-attempts (volatile! 0)]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
          (with-redefs [env/env (assoc env/env
                                       :mb-dependency-backfill-delay-minutes "1") ; 1 minute delay for retries
                        t2/update! (fn [model-kw id & args]
                                     (if (and (= model-kw :model/Card)
                                              (= id card-id)
                                              (zero? @update-attempts))
                                       (do
                                         (vswap! update-attempts inc)
                                         (throw (ex-info "Simulated DB error" {:id id})))
                                       (apply t2/update! model-kw id args)))]
            (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

            ;; first failure - should be put into retry state
            ;; fail MAX_RETRIES + 1 times
            (while (zero? @update-attempts)
              (dependencies.task.tu/backfill-dependencies-single-trigger!))
            (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0)))

          ;; advance time by less than retry delay - should NOT be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 10 :seconds))
            (dependencies.task.tu/backfill-dependencies-single-trigger!))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

          ;; advance time by more than retry delay - should be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 2 :minutes))
            (dependencies.task.tu/backfill-dependencies-single-trigger!))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version current-version)))))))
