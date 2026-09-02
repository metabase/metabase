(ns metabase-enterprise.dependencies.task.backfill-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.dependencies.task.backfill-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (org.quartz JobKey)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- backfill-all-existing-entities!
  []
  (deps.test/synchronously-run-backfill!))

(defn- backfill-dependencies-single-trigger!
  []
  (mt/with-premium-features #{:dependencies}
    (#'dependencies.backfill/backfill-dependencies!)))

(defn- mark-stale!
  "Mark an entity as stale in dependency_status for testing."
  [entity-type entity-id]
  (deps.dependency-status/mark-stale! entity-type [entity-id]))

(defn- assert-processed
  "Assert that an entity has been processed (not stale, current version)."
  [entity-type entity-id]
  (is (t2/exists? :model/DependencyStatus
                  'entity_type entity-type
                  'entity_id entity-id
                  'stale false
                  'dependency_analysis_version dependencies.model/current-dependency-analysis-version)
      (str "Expected " (name entity-type) " " entity-id " to be processed")))

(deftest ^:synchronized backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly processes stale entities"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (let [query (mt/mbql-query orders)]
        (mt/with-premium-features #{}
          (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                         :model/Card {card2-id :id} {:dataset_query query}
                         :model/Card {card3-id :id} {:dataset_query query}]
            ;; Mark all three cards as stale
            (mark-stale! :card card1-id)
            (mark-stale! :card card2-id)
            (mark-stale! :card card3-id)
            (let [stale-count (fn []
                                (t2/count :model/DependencyStatus
                                          'entity_type :card
                                          'entity_id [:in [card1-id card2-id card3-id]]
                                          'stale true))]
              (is (= 3 (stale-count)))
              ;; first run, should process 2 cards
              (is (true? (backfill-dependencies-single-trigger!)))
              (is (= 1 (stale-count)))
              ;; second run, should process the last card
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 0 (stale-count)))
              ;; third run, should not process anything
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 0 (stale-count))))))))))

(deftest ^:synchronized backfill-transform-test
  (testing "Test that transforms are correctly backfilled"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}
                       :model/Transform {transform-id :id} {:name "Test Transform"
                                                            :source {:type "query"
                                                                     :query (mt/mbql-query nil
                                                                              {:source-table (str "card__" card-id)})}
                                                            :target {:type "table" :name (mt/random-name)}}]
          ;; Mark both as stale
          (mark-stale! :card card-id)
          (mark-stale! :transform transform-id)
          (is (false? (t2/exists? :model/Dependency 'from_entity_type :card      'from_entity_id card-id)))
          (is (false? (t2/exists? :model/Dependency 'from_entity_type :transform 'from_entity_id transform-id)))
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          (assert-processed :transform transform-id)
          (is (t2/exists? :model/Dependency
                          'from_entity_type :card 'from_entity_id card-id
                          'to_entity_type :table 'to_entity_id (mt/id :orders)))
          (is (t2/exists? :model/Dependency
                          'from_entity_type :transform 'from_entity_id transform-id
                          'to_entity_type :card 'to_entity_id card-id)))))))

(deftest ^:synchronized backfill-snippet-test
  (testing "Test that cards with snippets are correctly backfilled"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my_snippet"
                                                                   :content "SELECT 1"}
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
                                                                             :snippet-id snippet-id}}}}}]
          ;; Mark both as stale
          (mark-stale! :card card-id)
          (mark-stale! :snippet snippet-id)
          (is (false? (t2/exists? :model/Dependency
                                  'from_entity_type :card 'from_entity_id card-id
                                  'to_entity_type :snippet 'to_entity_id snippet-id)))
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          (assert-processed :snippet snippet-id)
          (is (t2/exists? :model/Dependency
                          'from_entity_type :card 'from_entity_id card-id
                          'to_entity_type :snippet 'to_entity_id snippet-id)))))))

(deftest ^:synchronized backfill-snippet-in-snippet-test
  (testing "A snippet referencing another snippet produces a snippet->snippet dependency"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "inner_snip" :content "1 = 1"}
                     :model/NativeQuerySnippet {outer-id :id} {:name "outer_snip" :content "SELECT * WHERE {{snippet: inner_snip}}"}]
        (mark-stale! :snippet inner-id)
        (mark-stale! :snippet outer-id)
        (is (false? (t2/exists? :model/Dependency
                                'from_entity_type :snippet 'from_entity_id outer-id
                                'to_entity_type :snippet 'to_entity_id inner-id)))
        (backfill-dependencies-single-trigger!)
        (assert-processed :snippet inner-id)
        (assert-processed :snippet outer-id)
        (is (t2/exists? :model/Dependency
                        'from_entity_type :snippet 'from_entity_id outer-id
                        'to_entity_type :snippet 'to_entity_id inner-id))))))

(deftest ^:synchronized backfill-snippet-referencing-card-test
  (testing "A snippet referencing a card produces a snippet->card dependency"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/NativeQuerySnippet {snippet-id :id} {:name "card_ref_snip"
                                                                 :content (format "SELECT * FROM {{#%d}}" card-id)}]
        (mark-stale! :card card-id)
        (mark-stale! :snippet snippet-id)
        (is (false? (t2/exists? :model/Dependency
                                'from_entity_type :snippet 'from_entity_id snippet-id
                                'to_entity_type :card 'to_entity_id card-id)))
        (backfill-dependencies-single-trigger!)
        (assert-processed :snippet snippet-id)
        (is (t2/exists? :model/Dependency
                        'from_entity_type :snippet 'from_entity_id snippet-id
                        'to_entity_type :card 'to_entity_id card-id))))))

(deftest ^:synchronized backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
          (mark-stale! :card card-id)
          (is (false? (t2/exists? :model/Dependency 'from_entity_type :card 'from_entity_id card-id
                                  'to_entity_type :table 'to_entity_id (mt/id :orders))))
          ;; First run
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          ;; Second run - should not change anything
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          (is (t2/exists? :model/Dependency 'from_entity_type :card 'from_entity_id card-id
                          'to_entity_type :table 'to_entity_id (mt/id :orders))))))))

(defn- wait-for-condition
  [predicate timeout-ms]
  (let [limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 100)
      (or (predicate)
          (when (< (System/currentTimeMillis) limit)
            (recur))))))

(deftest ^:synchronized backfill-scheduling-test
  (testing "With 2 entities and batch size 1, the job reschedules itself and processes both"
    (backfill-all-existing-entities!)
    (mt/with-temp-scheduler!
      (with-redefs [env/env (assoc env/env
                                   :mb-dependency-backfill-batch-size "1"
                                   :mb-dependency-backfill-delay-minutes "0"
                                   :mb-dependency-backfill-variance-minutes "0")]
        (let [card-data {:dataset_query (mt/mbql-query orders)}]
          (mt/test-helpers-set-global-values!
            (mt/with-premium-features #{}
              (mt/with-temp [:model/Card {card1-id :id} card-data
                             :model/Card {card2-id :id} card-data]
                (mark-stale! :card card1-id)
                (mark-stale! :card card2-id)
                (let [processed? (fn []
                                   (= 2 (t2/count :model/DependencyStatus
                                                  'entity_type :card
                                                  'entity_id [:in [card1-id card2-id]]
                                                  'stale false
                                                  'dependency_analysis_version dependencies.model/current-dependency-analysis-version)))]
                  (is (not (processed?)))
                  (mt/with-premium-features #{:dependencies}
                    (task/init! ::dependencies.backfill/DependencyBackfill)
                    (wait-for-condition processed? 2500)
                    (is (processed?))))))))))))

(deftest ^:synchronized backfill-no-trigger-pile-up-test
  (testing "Scheduling new runs while the backfill job is executing keeps the trigger count ≤ 1"
    (let [job-started (promise)
          can-finish  (promise)]
      (with-redefs [dependencies.backfill/backfill-dependencies!
                    (fn []
                      (deliver job-started true)
                      (deref can-finish 1500 :timeout)
                      ;; non-nil → the job will hit the in-job self-reschedule path on exit
                      true)]
        (mt/with-temp-scheduler!
          ;; Start the job immediately.
          (#'dependencies.backfill/schedule-run! (task/scheduler) 0)
          (is (true? (deref job-started 1000 :timeout))
              "BackfillDependencies job did not start within 1s")
          (let [scheduler (task/scheduler)
                job-key   (JobKey. "metabase.task.dependency-backfill.job")
                trigger-count #(count (.getTriggersOfJob scheduler job-key))]
            ;; Spam 50 event-driven schedule attempts while the job is in-flight.
            (dotimes [_ 50]
              (dependencies.backfill/trigger-backfill-job!))
            (is (<= (trigger-count) 1)
                (str "During execution: expected ≤ 1 trigger, got " (trigger-count)))
            ;; Release the job; on exit it self-reschedules via the in-job path.
            (deliver can-finish true)
            (Thread/sleep 200)
            (is (<= (trigger-count) 1)
                (str "After self-reschedule: expected ≤ 1 trigger, got " (trigger-count)))))))))

(deftest ^:synchronized backfill-error-logging-test
  (testing "When calculate-deps throws, the error is logged and the entity remains stale"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (mark-stale! :card card-id)
        (with-redefs [env/env (assoc env/env
                                     :mb-dependency-backfill-delay-minutes "0"
                                     :mb-dependency-backfill-variance-minutes "0")
                      deps.calculation/calculate-deps
                      (fn [_ _] (throw (ex-info "Simulated error" {})))]
          (backfill-dependencies-single-trigger!))
        ;; Entity should still be stale — not processed, not lost
        (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
        ;; No dependencies should have been created
        (is (empty? (t2/select :model/Dependency 'from_entity_type :card 'from_entity_id card-id)))
        ;; Failure recorded in table
        (is (= 1 (t2/select-one-fn :fail_count :model/DependencyStatus
                                   'entity_type :card 'entity_id card-id)))))))

(deftest ^:synchronized backfill-partial-batch-failure-test
  (testing "A failure on one entity doesn't prevent other entities from being processed"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {good-card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/Card {bad-card-id :id} {:dataset_query (mt/mbql-query products)}]
        (mark-stale! :card good-card-id)
        (mark-stale! :card bad-card-id)
        (let [original-calculate-deps deps.calculation/calculate-deps]
          (with-redefs [env/env (assoc env/env
                                       :mb-dependency-backfill-delay-minutes "0"
                                       :mb-dependency-backfill-variance-minutes "0")
                        deps.calculation/calculate-deps
                        (fn [entity-type entity]
                          (if (= (:id entity) bad-card-id)
                            (throw (ex-info "Simulated error" {}))
                            (original-calculate-deps entity-type entity)))]
            (backfill-dependencies-single-trigger!)))
        ;; Good card should be processed successfully
        (assert-processed :card good-card-id)
        (is (seq (t2/select :model/Dependency 'from_entity_type :card 'from_entity_id good-card-id)))
        ;; Bad card should remain stale with failure recorded
        (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id bad-card-id 'stale true))
        (is (= 1 (t2/select-one-fn :fail_count :model/DependencyStatus
                                   'entity_type :card 'entity_id bad-card-id)))))))

(deftest ^:synchronized backfill-terminal-failure-test
  (testing "Entities should be marked as terminally broken after MAX_RETRIES failures"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (mark-stale! :card card-id)
        (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
        (let [compute-attempts (volatile! 0)
              failures (inc @#'dependencies.backfill/max-retries)]
          (with-redefs [env/env (assoc env/env
                                       :mb-dependency-backfill-delay-minutes "0"
                                       :mb-dependency-backfill-variance-minutes "0")
                        ;; Make compute-deps-for-entity! throw
                        deps.calculation/calculate-deps
                        (fn [_ _]
                          (vswap! compute-attempts inc)
                          (throw (ex-info "Simulated computation error" {:card-id card-id})))]
            ;; fail MAX_RETRIES + 1 times
            (while (< @compute-attempts failures)
              (backfill-dependencies-single-trigger!))))
        ;; verify card is still stale (not processed)
        (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
        ;; verify subsequent runs don't process it
        (backfill-dependencies-single-trigger!)
        (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))))))

(deftest ^:synchronized backfill-delayed-retry-test
  (testing "Failed entities should be retried after their delay period expires"
    (backfill-all-existing-entities!)
    (let [compute-attempts (volatile! 0)]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
          (mark-stale! :card card-id)
          (with-redefs [env/env (assoc env/env
                                       :mb-dependency-backfill-delay-minutes "1")
                        deps.calculation/calculate-deps
                        (fn [_ _entity]
                          (if (zero? @compute-attempts)
                            (do
                              (vswap! compute-attempts inc)
                              (throw (ex-info "Simulated computation error" {:card-id card-id})))
                            ;; Return valid deps on subsequent attempts
                            {:table #{(mt/id :orders)}}))]
            (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
            ;; first failure - should be put into retry state
            (while (zero? @compute-attempts)
              (backfill-dependencies-single-trigger!))
            (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
            ;; advance time by less than retry delay - should NOT be processed
            (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 10 :seconds))
              (backfill-dependencies-single-trigger!))
            (is (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id 'stale true))
            ;; advance time by more than retry delay - should be processed
            (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 2 :minutes))
              (backfill-dependencies-single-trigger!))
            (assert-processed :card card-id)))))))

(deftest backfill-card-does-not-cause-revision-test
  (testing "backfilling a card does not create a new revision or audit log entry"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies :audit-app}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (mark-stale! :card card-id)
        (let [revision-count-before (t2/count :model/Revision 'model "Card" 'model_id card-id)
              deps-before (t2/count :model/Dependency 'from_entity_type :card 'from_entity_id card-id)]
          (is (= 0 revision-count-before))
          (is (= 0 deps-before))
          (backfill-dependencies-single-trigger!)
          (let [revision-count-after (t2/count :model/Revision 'model "Card" 'model_id card-id)
                deps-after (t2/count :model/Dependency 'from_entity_type :card 'from_entity_id card-id)]
            (is (= 0 revision-count-after))
            (assert-processed :card card-id)
            (is (= 1 deps-after))))))))

(deftest ^:synchronized backfill-dependencies-on-serdes-load-test
  (testing "Serdes load triggers the backfill job (entities remain stale until job runs)"
    (backfill-all-existing-entities!)
    (let [query (mt/mbql-query orders)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                       :model/Card {card2-id :id} {:dataset_query query}
                       :model/Card {card3-id :id} {:dataset_query query}]
          ;; Mark all as stale
          (mark-stale! :card card1-id)
          (mark-stale! :card card2-id)
          (mark-stale! :card card3-id)
          ;; serdes-load triggers the async job, not synchronous processing
          (events/publish-event! :event/serdes-load {})
          ;; entities are still stale (job hasn't run yet in this test)
          (is (= 3 (t2/count :model/DependencyStatus
                             'entity_type :card
                             'entity_id [:in [card1-id card2-id card3-id]]
                             'stale true)))
          ;; manually run the backfill to verify it processes them
          (backfill-all-existing-entities!)
          (is (= 3 (t2/count :model/DependencyStatus
                             'entity_type :card
                             'entity_id [:in [card1-id card2-id card3-id]]
                             'stale false
                             'dependency_analysis_version dependencies.model/current-dependency-analysis-version))))))))

(deftest ^:synchronized backfill-dependencies-on-token-update-test
  (testing "Token update triggers the backfill job (entities remain stale until job runs)"
    (backfill-all-existing-entities!)
    (let [query (mt/mbql-query orders)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                       :model/Card {card2-id :id} {:dataset_query query}
                       :model/Card {card3-id :id} {:dataset_query query}]
          ;; Mark all as stale
          (mark-stale! :card card1-id)
          (mark-stale! :card card2-id)
          (mark-stale! :card card3-id)
          ;; token update triggers the async job, not synchronous processing
          (events/publish-event! :event/set-premium-embedding-token {})
          ;; entities are still stale (job hasn't run yet in this test)
          (is (= 3 (t2/count :model/DependencyStatus
                             'entity_type :card
                             'entity_id [:in [card1-id card2-id card3-id]]
                             'stale true)))
          ;; manually run the backfill to verify it processes them
          (backfill-all-existing-entities!)
          (is (= 3 (t2/count :model/DependencyStatus
                             'entity_type :card
                             'entity_id [:in [card1-id card2-id card3-id]]
                             'stale false
                             'dependency_analysis_version dependencies.model/current-dependency-analysis-version))))))))

(deftest ^:synchronized backfill-version-outdated-test
  (testing "Entities with outdated version in dependency_status get reprocessed"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        ;; Create a dependency_status entry with an old version (not stale, but outdated)
        (t2/insert! :model/DependencyStatus {:entity_type :card
                                             :entity_id card-id
                                             :dependency_analysis_version 0
                                             :stale false})
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (t2/exists? :model/Dependency 'from_entity_type :card 'from_entity_id card-id
                        'to_entity_type :table 'to_entity_id (mt/id :orders)))))))

(deftest ^:synchronized backfill-no-status-row-test
  (testing "Entities with no dependency_status row yet get picked up and processed by the backfill"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        ;; Precondition: the temp card was inserted directly (no :event/card-create), so it has no
        ;; status row at all. This is the case the left-join in instances-for-dependency-calculation
        ;; must catch — guard it so the test can't silently pass without exercising that branch.
        (is (not (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id))
            "Expected the temp card to start with no dependency_status row")
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (t2/exists? :model/Dependency 'from_entity_type :card 'from_entity_id card-id
                        'to_entity_type :table 'to_entity_id (mt/id :orders)))))))

(deftest ^:synchronized has-stale-or-outdated?-counts-no-status-row-test
  (testing "has-stale-or-outdated? (backing /backfill-status) stays consistent with what the backfill processes"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      ;; Clean slate: nothing left to process.
      (is (false? (deps.dependency-status/has-stale-or-outdated?))
          "Expected no pending work after backfilling all existing entities")
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        ;; A card with no status row is pending work, even though no DependencyStatus row exists.
        (is (not (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id)))
        (is (true? (deps.dependency-status/has-stale-or-outdated?))
            "Expected pending work: a card with no status row still needs calculation")
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (false? (deps.dependency-status/has-stale-or-outdated?))
            "Expected no pending work once the card has been processed")))))

(deftest ^:synchronized batch-size-zero-suppresses-event-triggers-but-stays-warm-test
  (testing "A non-positive batch size stops the job doing work, but leaves it on its slow periodic schedule so it
           resumes if the setting ever becomes positive. What it must not do is keep firing the 1-second event-driven
           trigger, which is what made a disabled job wake roughly once a second on a busy instance -- entity changes
           fire it, and it never consulted the batch size."
    (let [scheduled    (atom [])
          scheduled-by (fn [thunk]
                         (reset! scheduled [])
                         (thunk)
                         (count @scheduled))]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "0")]
          (testing "the 1-second event-driven trigger is suppressed"
            (is (zero? (scheduled-by dependencies.backfill/trigger-backfill-job!))))
          (testing "but task/init! still puts the job on its periodic schedule"
            (is (= 1 (scheduled-by #(task/init! ::dependencies.backfill/DependencyBackfill)))))
          (testing "and a run keeps the chain going rather than stopping"
            (mt/with-premium-features #{:dependencies}
              (is (= 1 (scheduled-by #(#'dependencies.backfill/run-and-reschedule! nil)))))))
        (testing "a positive batch size schedules from the event trigger too"
          (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "5")]
            (is (= 1 (scheduled-by dependencies.backfill/trigger-backfill-job!)))))))))

(deftest ^:synchronized backfill-batch-shares-one-metadata-provider-test
  (testing "GHY-4251: every entity in a batch must share one MetadataProvider per database. Reading an entity attaches
           a provider to its query, so without a batch-scoped cache each entity gets a private one; native dep
           calculation then fills each with that database's table metadata and the batch retains one copy per entity,
           which is what exhausted the heap on instances with large warehouses."
    (backfill-all-existing-entities!)
    (let [providers (atom [])
          calculate-deps deps.calculation/calculate-deps
          native-card (fn [sql] {:database (mt/id) :type :native :native {:query sql}})]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query (native-card "select id from orders")}
                       :model/Card {card2-id :id} {:dataset_query (native-card "select id from products")}]
          (mark-stale! :card card1-id)
          (mark-stale! :card card2-id)
          (with-redefs [deps.calculation/calculate-deps
                        (fn [entity-type entity]
                          (when-let [mp (:lib/metadata (:dataset_query entity))]
                            (swap! providers conj mp))
                          (calculate-deps entity-type entity))]
            (backfill-dependencies-single-trigger!))
          (testing "both cards were analyzed, so the assertion below is meaningful"
            (is (<= 2 (count @providers))))
          (testing "and they were analyzed through the same provider instance"
            ;; Identity, not equality: providers compare equal when they wrap the same database id, so `=` would be
            ;; satisfied by two separate caches and would not detect the regression.
            (is (= 1 (count (into #{} (map #(System/identityHashCode %)) @providers))))))))))

(deftest ^:synchronized backfill-records-failure-for-fatal-error-test
  (testing "GHY-4251: a fatal Error must record the entity's failure before propagating. Only Exception was caught,
           so an OutOfMemoryError escaped without recording anything and the next run selected the identical batch --
           a crash loop that never made progress. Recording first means the entity backs off and eventually goes
           terminal, so the batch drains even if one entity always kills the process."
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (mark-stale! :card card-id)
        (with-redefs [deps.calculation/calculate-deps (fn [& _] (throw (Error. "simulated fatal error")))]
          (testing "the Error propagates instead of being swallowed, failing the job"
            (is (thrown-with-msg? Error #"simulated fatal error"
                                  (backfill-dependencies-single-trigger!)))))
        (testing "and the failure was recorded first, so the next run backs off instead of replaying the batch"
          (let [{:keys [fail_count next_retry_at terminal]}
                (t2/select-one :model/DependencyStatus 'entity_type :card 'entity_id card-id)]
            (is (= 1 fail_count))
            (is (some? next_retry_at))
            (is (false? terminal))))))))

(deftest ^:synchronized pending-retries-licence-states-test
  (testing "A pending retry keeps the backfill job scheduled, but only when the licence permits acting on it. A retry
           marker is cleared by processing the entity -- on success via upsert-status!, or by going terminal past
           max-retries -- and both are gated on the feature, so without it the job could never resolve the condition
           keeping it awake and rescheduled hourly forever.

           The licence is resolved with canonically-has-feature? rather than has-feature?, which collapses 'no licence'
           and 'could not check' into the same false. Both inputs to the job's reschedule decision consult the licence,
           so a transient token failure would take the job down permanently -- nothing re-fires when the check
           recovers, because the token never changed."
    (backfill-all-existing-entities!)
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
      (mark-stale! :card card-id)
      (backfill-dependencies-single-trigger!)
      (deps.dependency-status/record-failure! :card card-id 5 60)
      (is (t2/exists? :model/DependencyStatus
                      'entity_type :card 'entity_id card-id
                      'terminal false 'next_retry_at [:not= nil])
          "test setup: the card must be in retry backoff")
      (let [actionable? (fn [licence]
                          (with-redefs [premium-features/canonically-has-feature? (constantly licence)]
                            (#'dependencies.backfill/has-pending-retries?)))]
        (testing "licensed: the pending retry keeps the job scheduled"
          (is (true? (actionable? true))))
        (testing "indeterminate: treated as actionable, so a blip cannot end the chain"
          (is (true? (actionable? nil))))
        (testing "definitively unlicensed: not actionable"
          (is (false? (actionable? false))))))))

(deftest ^:synchronized backfill-records-failure-for-never-processed-entity-test
  (testing "An entity with no dependency_status row yet must still get a failure recorded when it fails. Such entities
           are explicitly selected for processing (instances-for-dependency-calculation matches a null status row), so
           on a first backfill every entity is in this state -- exactly the population most likely to fail on a large
           instance. record-failure! only updated an existing row, so nothing was recorded and the next run selected
           the identical batch: the crash loop, unbroken for the entities most likely to cause it."
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (is (not (t2/exists? :model/DependencyStatus 'entity_type :card 'entity_id card-id))
            "test setup: the card must have no status row, which is what makes it eligible")
        (with-redefs [deps.calculation/calculate-deps (fn [& _] (throw (ex-info "boom" {})))]
          (backfill-dependencies-single-trigger!))
        (testing "the failure is recorded, so the entity backs off instead of being reselected unchanged"
          (let [{:keys [fail_count next_retry_at]}
                (t2/select-one :model/DependencyStatus 'entity_type :card 'entity_id card-id)]
            (is (= 1 fail_count))
            (is (some? next_retry_at))))))))

(deftest ^:synchronized fatal-error-still-reschedules-test
  (testing "A failure must not leave the job unscheduled. The job is one-shot self-rescheduling with no cron
           backstop, so an Error propagating out of the batch skipped schedule-run! entirely and the chain ended
           until a content-change event or a restart. A real OutOfMemoryError usually takes the process with it and
           task/init! recovers on boot, but survivable Errors -- StackOverflowError from deeply nested SQL, an
           AssertionError, a LinkageError -- leave a live process with a dead job."
    (let [scheduled (atom [])]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)
                    dependencies.backfill/backfill-dependencies!
                    (fn [& _] (throw (Error. "simulated fatal error")))]
        (testing "the Error still propagates"
          (is (thrown-with-msg? Error #"simulated fatal error"
                                (#'dependencies.backfill/run-and-reschedule! nil))))
        (testing "and the next run was scheduled anyway"
          (is (= 1 (count @scheduled))))))))
