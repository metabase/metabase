(ns metabase-enterprise.dependencies.task.backfill-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.events.core :as events]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- backfill-all-existing-entities!
  []
  (mt/with-premium-features #{:dependencies}
    (while (#'dependencies.backfill/backfill-dependencies!))))

(defn- backfill-dependencies-single-trigger!
  []
  (mt/with-premium-features #{:dependencies}
    (#'dependencies.backfill/backfill-dependencies!)))

(deftest ^:sequential backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly updates the dependency_analysis_version"
    (backfill-all-existing-entities!)
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
              (is (true? (backfill-dependencies-single-trigger!)))
              (is (= 2 (card-count :dependency_analysis_version current-version)))
              ;; second run, should process the last card
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 3 (card-count :dependency_analysis_version current-version)))
              ;; third run, should not process anything
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 3 (card-count :dependency_analysis_version current-version))))))))))

(deftest ^:sequential backfill-transform-test
  (testing "Test that transforms are correctly backfilled"
    (backfill-all-existing-entities!)
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
          (backfill-dependencies-single-trigger!)
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
    (backfill-all-existing-entities!)
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
          (backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/NativeQuerySnippet :id snippet-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :snippet :to_entity_id snippet-id)))))))

(deftest ^:sequential backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                  :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :table :to_entity_id (mt/id :orders))))
          ;; First run
          (backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          ;; Second run - should not change anything
          (backfill-dependencies-single-trigger!)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :table :to_entity_id (mt/id :orders))))))))

(defn- wait-for-condition
  [predicate timeout-ms]
  (let [limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 100)
      (or (predicate)
          (when (< (System/currentTimeMillis) limit)
            (recur))))))

(deftest ^:sequential backfill-scheduling-test
  (testing "Test that the backfill job schedules and reschedules itself correctly"
    (backfill-all-existing-entities!)
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
                    (wait-for-condition #(= 3 (card-count :dependency_analysis_version current-version)) 10000)
                    (is (= 3 (card-count :dependency_analysis_version current-version)))))))))))))

(deftest ^:sequential backfill-terminal-failure-test
  (testing "Entities should be marked as terminally broken after MAX_RETRIES failures"
    (backfill-all-existing-entities!)
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
              (backfill-dependencies-single-trigger!))))

        ;; verify card is not processed and is terminally broken
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

        ;; verify subsequent runs don't process it
        (backfill-dependencies-single-trigger!)
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))))))

(deftest ^:sequential backfill-delayed-retry-test
  (testing "Failed entities should be retried after their delay period expires"
    (backfill-all-existing-entities!)
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
              (backfill-dependencies-single-trigger!))
            (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0)))

          ;; advance time by less than retry delay - should NOT be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 10 :seconds))
            (backfill-dependencies-single-trigger!))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

          ;; advance time by more than retry delay - should be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 2 :minutes))
            (backfill-dependencies-single-trigger!))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version current-version)))))))

(deftest backfill-card-does-not-cause-revision-test
  (testing "backfilling a card does not create a new revision or audit log entry"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies :audit-app}
      (mt/with-temp [:model/Card {card-id :id
                                  dep-version :dependency_analysis_version}
                     {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
        (let [revision-count-before (t2/count :model/Revision :model "Card" :model_id card-id)
              deps-before (t2/count :model/Dependency :from_entity_type :card :from_entity_id card-id)]
          (is (= 0 dep-version))
          (is (= 0 revision-count-before))
          (is (= 0 deps-before))
          (backfill-dependencies-single-trigger!)
          (let [revision-count-after (t2/count :model/Revision :model "Card" :model_id card-id)
                dep-version-after (t2/select-one-fn :dependency_analysis_version :model/Card :id card-id)
                deps-after (t2/count :model/Dependency :from_entity_type :card :from_entity_id card-id)]
            (is (= 0 revision-count-after))
            (is (= dependencies.model/current-dependency-analysis-version dep-version-after))
            (is (= 1 deps-after))))))))

(deftest ^:sequential backfill-dependencies-on-serdes-load-test
  (testing "Test that serdes load correctly updates the dependency_analysis_version"
    (backfill-all-existing-entities!)
    (let [query (mt/mbql-query orders)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card2-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card3-id :id} {:dependency_analysis_version 0, :dataset_query query}]
          (let [card-count (fn [& args]
                             (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                current-version dependencies.model/current-dependency-analysis-version]
            (events/publish-event! :event/serdes-load {})
            (is (= 3 (card-count :dependency_analysis_version current-version)))))))))

(deftest ^:sequential backfill-dependencies-on-token-update-test
  (testing "Test that token update correctly updates the dependency_analysis_version"
    (backfill-all-existing-entities!)
    (let [query (mt/mbql-query orders)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card2-id :id} {:dependency_analysis_version 0, :dataset_query query}
                       :model/Card {card3-id :id} {:dependency_analysis_version 0, :dataset_query query}]
          (let [card-count (fn [& args]
                             (apply t2/count :model/Card :id [:in [card1-id card2-id card3-id]] args))
                current-version dependencies.model/current-dependency-analysis-version]
            (events/publish-event! :event/set-premium-embedding-token {})
            (is (= 3 (card-count :dependency_analysis_version current-version)))))))))
