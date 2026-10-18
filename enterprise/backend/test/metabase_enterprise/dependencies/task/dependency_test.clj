(ns metabase-enterprise.dependencies.task.dependency-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.dependencies.task.dependency-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
  (deps.test/synchronously-run-dependency-job!))

(defn- backfill-dependencies-single-trigger!
  []
  (mt/with-premium-features #{:dependencies}
    (#'task.dependency/update-dependencies!)))

(defn- clear-version!
  "Have the dependencies of an entity computed again, as if it changed."
  [entity-type entity-id]
  (deps.dependency-status/clear-version! {entity-type #{entity-id}}))

(defn- pending?
  "Whether the dependencies of the entity `entity-type` `entity-id` were not computed from its current version."
  [entity-type entity-id]
  (boolean (some #(= entity-id (:id (first %)))
                 (deps.dependency-status/instances-for-dependency-calculation entity-type 100000))))

(defn- processed?
  "Whether the dependencies of the entity `entity-type` `entity-id` were computed from its current version by the
  current analysis."
  [entity-type entity-id]
  (and (t2/exists? :model/DependencyStatus
                   :entity_type entity-type
                   :entity_id entity-id
                   :dependency_analysis_version dependencies.model/current-dependency-analysis-version)
       (not (pending? entity-type entity-id))))

(defn- assert-processed
  "Assert that an entity has been processed."
  [entity-type entity-id]
  (is (processed? entity-type entity-id)
      (str "Expected " (name entity-type) " " entity-id " to be processed")))

(deftest ^:synchronized backfill-dependency-analysis-test
  (testing "Test that the dependency job processes the pending entities in batches"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (let [query (mt/mbql-query orders)]
        (mt/with-premium-features #{}
          (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                         :model/Card {card2-id :id} {:dataset_query query}
                         :model/Card {card3-id :id} {:dataset_query query}]
            (clear-version! :card card1-id)
            (clear-version! :card card2-id)
            (clear-version! :card card3-id)
            (let [pending-count (fn [] (count (filter #(pending? :card %) [card1-id card2-id card3-id])))]
              (is (= 3 (pending-count)))
              ;; first run, should process 2 cards
              (is (true? (backfill-dependencies-single-trigger!)))
              (is (= 1 (pending-count)))
              ;; second run, should process the last card
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 0 (pending-count)))
              ;; third run, should not process anything
              (is (false? (backfill-dependencies-single-trigger!)))
              (is (= 0 (pending-count))))))))))

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
          (clear-version! :card card-id)
          (clear-version! :transform transform-id)
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card      :from_entity_id card-id)))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :transform :from_entity_id transform-id)))
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          (assert-processed :transform transform-id)
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :table :to_entity_id (mt/id :orders)))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :transform :from_entity_id transform-id
                          :to_entity_type :card :to_entity_id card-id)))))))

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
          (clear-version! :card card-id)
          (clear-version! :snippet snippet-id)
          (is (false? (t2/exists? :model/Dependency
                                  :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :snippet :to_entity_id snippet-id)))
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          (assert-processed :snippet snippet-id)
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :snippet :to_entity_id snippet-id)))))))

(deftest ^:synchronized backfill-snippet-in-snippet-test
  (testing "A snippet referencing another snippet produces a snippet->snippet dependency"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "inner_snip" :content "1 = 1"}
                     :model/NativeQuerySnippet {outer-id :id} {:name "outer_snip" :content "SELECT * WHERE {{snippet: inner_snip}}"}]
        (clear-version! :snippet inner-id)
        (clear-version! :snippet outer-id)
        (is (false? (t2/exists? :model/Dependency
                                :from_entity_type :snippet :from_entity_id outer-id
                                :to_entity_type :snippet :to_entity_id inner-id)))
        (backfill-dependencies-single-trigger!)
        (assert-processed :snippet inner-id)
        (assert-processed :snippet outer-id)
        (is (t2/exists? :model/Dependency
                        :from_entity_type :snippet :from_entity_id outer-id
                        :to_entity_type :snippet :to_entity_id inner-id))))))

(deftest ^:synchronized backfill-snippet-referencing-card-test
  (testing "A snippet referencing a card produces a snippet->card dependency"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/NativeQuerySnippet {snippet-id :id} {:name "card_ref_snip"
                                                                 :content (format "SELECT * FROM {{#%d}}" card-id)}]
        (clear-version! :card card-id)
        (clear-version! :snippet snippet-id)
        (is (false? (t2/exists? :model/Dependency
                                :from_entity_type :snippet :from_entity_id snippet-id
                                :to_entity_type :card :to_entity_id card-id)))
        (backfill-dependencies-single-trigger!)
        (assert-processed :snippet snippet-id)
        (is (t2/exists? :model/Dependency
                        :from_entity_type :snippet :from_entity_id snippet-id
                        :to_entity_type :card :to_entity_id card-id))))))

(deftest ^:synchronized backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
          (clear-version! :card card-id)
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :table :to_entity_id (mt/id :orders))))
          ;; First run
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
          ;; Second run - should not change anything
          (backfill-dependencies-single-trigger!)
          (assert-processed :card card-id)
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
                (clear-version! :card card1-id)
                (clear-version! :card card2-id)
                (let [both-processed? #(every? (partial processed? :card) [card1-id card2-id])]
                  (is (not (both-processed?)))
                  (mt/with-premium-features #{:dependencies}
                    (task/init! ::task.dependency/UpdateDependencies)
                    (wait-for-condition both-processed? 2500)
                    (is (both-processed?))))))))))))

(deftest ^:synchronized backfill-no-trigger-pile-up-test
  (testing "Scheduling new runs while the dependency job is executing keeps the trigger count ≤ 1"
    (let [job-started (promise)
          can-finish  (promise)]
      ;; the job body runs on a Quartz worker thread, which does not inherit *local-redefs* —
      ;; only a root swap is visible there
      #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
      (with-redefs [task.dependency/update-dependencies!
                    (fn []
                      (deliver job-started true)
                      (deref can-finish 1500 :timeout)
                      ;; non-nil → the job will hit the in-job self-reschedule path on exit
                      true)]
        (mt/with-temp-scheduler!
          ;; Start the job immediately.
          (task.util/schedule-run! (task/scheduler) @#'task.dependency/job 0)
          (is (true? (deref job-started 1000 :timeout))
              "UpdateDependencies job did not start within 1s")
          (let [scheduler (task/scheduler)
                job-key   (JobKey. "metabase.task.dependency-backfill.job")
                trigger-count #(count (.getTriggersOfJob scheduler job-key))]
            ;; Spam 50 event-driven schedule attempts while the job is in-flight.
            (dotimes [_ 50]
              (task.dependency/trigger-dependency-job!))
            (is (<= (trigger-count) 1)
                (str "During execution: expected ≤ 1 trigger, got " (trigger-count)))
            ;; Release the job; on exit it self-reschedules via the in-job path.
            (deliver can-finish true)
            (Thread/sleep 200)
            (is (<= (trigger-count) 1)
                (str "After self-reschedule: expected ≤ 1 trigger, got " (trigger-count)))))))))

(deftest ^:synchronized backfill-error-logging-test
  (testing "When calculate-deps throws, the error is logged and the entity is not computed again until it changes"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (clear-version! :card card-id)
        (with-redefs [env/env (assoc env/env
                                     :mb-dependency-backfill-delay-minutes "0"
                                     :mb-dependency-backfill-variance-minutes "0")
                      deps.calculation/calculate-deps
                      (fn [_ _] (throw (ex-info "Simulated error" {})))]
          (backfill-dependencies-single-trigger!))
        ;; No dependencies should have been created
        (is (empty? (t2/select :model/Dependency :from_entity_type :card :from_entity_id card-id)))
        (is (not (pending? :card card-id)))))))

(deftest ^:synchronized backfill-partial-batch-failure-test
  (testing "A failure on one entity doesn't prevent other entities from being processed"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {good-card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/Card {bad-card-id :id} {:dataset_query (mt/mbql-query products)}]
        (clear-version! :card good-card-id)
        (clear-version! :card bad-card-id)
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
        (is (seq (t2/select :model/Dependency :from_entity_type :card :from_entity_id good-card-id)))
        (is (not (pending? :card bad-card-id)))))))

(deftest ^:synchronized backfill-failure-waits-for-a-change-test
  (testing "An entity whose calculation fails is not processed again until it changes again"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (clear-version! :card card-id)
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps
                                    (fn [_ _] (throw (ex-info "Simulated computation error" {:card-id card-id})))]
          (backfill-dependencies-single-trigger!))
        (is (not (pending? :card card-id)))
        (is (empty? (t2/select :model/Dependency :from_entity_type :card :from_entity_id card-id)))
        (clear-version! :card card-id)
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)))))

(deftest backfill-card-does-not-cause-revision-test
  (testing "backfilling a card does not create a new revision or audit log entry"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies :audit-app}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (clear-version! :card card-id)
        (let [revision-count-before (t2/count :model/Revision :model "Card" :model_id card-id)
              deps-before (t2/count :model/Dependency :from_entity_type :card :from_entity_id card-id)]
          (is (= 0 revision-count-before))
          (is (= 0 deps-before))
          (backfill-dependencies-single-trigger!)
          (let [revision-count-after (t2/count :model/Revision :model "Card" :model_id card-id)
                deps-after (t2/count :model/Dependency :from_entity_type :card :from_entity_id card-id)]
            (is (= 0 revision-count-after))
            (assert-processed :card card-id)
            (is (= 1 deps-after))))))))

(deftest ^:synchronized backfill-dependencies-on-token-update-test
  (testing "Token update triggers the dependency job (entities remain pending until job runs)"
    (backfill-all-existing-entities!)
    (let [query (mt/mbql-query orders)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                       :model/Card {card2-id :id} {:dataset_query query}
                       :model/Card {card3-id :id} {:dataset_query query}]
          (clear-version! :card card1-id)
          (clear-version! :card card2-id)
          (clear-version! :card card3-id)
          ;; token update triggers the async job, not synchronous processing
          (dependencies.hooks/after-premium-token-update)
          (is (every? #(pending? :card %) [card1-id card2-id card3-id]))
          ;; manually run the backfill to verify it processes them
          (backfill-all-existing-entities!)
          (is (every? #(processed? :card %) [card1-id card2-id card3-id])))))))

(deftest ^:synchronized backfill-version-outdated-test
  (testing "Entities with outdated version in dependency_status get reprocessed"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (backfill-dependencies-single-trigger!)
        (t2/update! :model/DependencyStatus :entity_type :card :entity_id card-id {:dependency_analysis_version 0})
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                        :to_entity_type :table :to_entity_id (mt/id :orders)))))))

(deftest ^:synchronized backfill-no-status-row-test
  (testing "Entities with no dependency_status row yet get picked up and processed by the backfill"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        ;; Precondition: the temp card was inserted directly (no :event/card-create), so it has no
        ;; status row at all. This is the case the left-join in instances-for-dependency-calculation
        ;; must catch — guard it so the test can't silently pass without exercising that branch.
        (is (not (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id))
            "Expected the temp card to start with no dependency_status row")
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                        :to_entity_type :table :to_entity_id (mt/id :orders)))))))

(deftest ^:synchronized has-pending-entities?-counts-no-status-row-test
  (testing "has-pending-entities? (backing /backfill-status) stays consistent with what the dependency job processes"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      ;; Clean slate: nothing left to process.
      (is (false? (deps.dependency-status/has-pending-entities?))
          "Expected no pending work after backfilling all existing entities")
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        ;; A card with no status row is pending work, even though no DependencyStatus row exists.
        (is (not (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id)))
        (is (true? (deps.dependency-status/has-pending-entities?))
            "Expected pending work: a card with no status row still needs calculation")
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (false? (deps.dependency-status/has-pending-entities?))
            "Expected no pending work once the card has been processed")))))

(deftest ^:synchronized batch-size-zero-disables-the-job-test
  (testing "a batch size that isn't positive keeps the job from being scheduled by writes or at startup"
    (let [scheduled    (atom [])
          scheduled-by (fn [thunk]
                         (reset! scheduled [])
                         (thunk)
                         (count @scheduled))]
      (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& args]
                                                        (when (some #(str/includes? (str %) "dependency-backfill") args)
                                                          (swap! scheduled conj args))
                                                        nil)]
        (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "0")]
          (is (zero? (scheduled-by task.dependency/trigger-dependency-job!)))
          (is (zero? (scheduled-by #(task/init! ::task.dependency/UpdateDependencies)))))
        (testing "a positive batch size schedules from the event trigger"
          (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "5")]
            (is (= 1 (scheduled-by task.dependency/trigger-dependency-job!)))))))))

(deftest ^:synchronized backfill-batch-shares-one-metadata-provider-test
  (testing "GHY-4251: every entity in a batch must share one MetadataProvider per database. Reading an entity attaches
           a provider to its query, so without a batch-scoped cache each entity gets a private one; native dep
           calculation then fills each with that database's table metadata and the batch retains one copy per entity,
           which is what exhausted the heap on instances with large warehouses."
    (backfill-all-existing-entities!)
    (let [providers (atom [])
          calculate-deps (mt/original-fn #'deps.calculation/calculate-deps)
          native-card (fn [sql] {:database (mt/id) :type :native :native {:query sql}})]
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query (native-card "select id from orders")}
                       :model/Card {card2-id :id} {:dataset_query (native-card "select id from products")}]
          (clear-version! :card card1-id)
          (clear-version! :card card2-id)
          (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps
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
           a crash loop that never made progress. Recording first records the entity's version, so the batch drains
           even if one entity always kills the process."
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (clear-version! :card card-id)
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps (fn [& _] (throw (Error. "simulated fatal error")))]
          (testing "the Error propagates instead of being swallowed, failing the job"
            (is (thrown-with-msg? Error #"simulated fatal error"
                                  (backfill-dependencies-single-trigger!)))))
        (testing "and the failure was recorded first, so the next run skips the entity instead of replaying the batch"
          (is (not (pending? :card card-id))))))))

(deftest ^:synchronized backfill-records-failure-for-never-processed-entity-test
  (testing "An entity with no dependency_status row yet must still get a failure recorded when it fails. Such entities
           are explicitly selected for processing (instances-for-dependency-calculation matches a null status row), so
           on a first backfill every entity is in this state -- exactly the population most likely to fail on a large
           instance. record-failure! only updated an existing row, so nothing was recorded and the next run selected
           the identical batch: the crash loop, unbroken for the entities most likely to cause it."
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (is (not (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id))
            "test setup: the card must have no status row, which is what makes it eligible")
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps (fn [& _] (throw (ex-info "boom" {})))]
          (backfill-dependencies-single-trigger!))
        (testing "the failure is recorded, so the entity is not reselected unchanged"
          (is (not (pending? :card card-id))))))))

(deftest ^:synchronized fatal-error-still-reschedules-test
  (testing "A failure must not leave the job unscheduled. The job is one-shot self-rescheduling with no cron
           backstop, so an Error propagating out of the batch skipped schedule-run! entirely and the chain ended
           until a content-change event or a restart. A real OutOfMemoryError usually takes the process with it and
           task/init! recovers on boot, but survivable Errors -- StackOverflowError from deeply nested SQL, an
           AssertionError, a LinkageError -- leave a live process with a dead job."
    (let [scheduled (atom [])]
      (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)
                                  task.dependency/update-dependencies!
                                  (fn [& _] (throw (Error. "simulated fatal error")))]
        (testing "the Error still propagates"
          (is (thrown-with-msg? Error #"simulated fatal error"
                                (task.util/run-and-reschedule! nil @#'task.dependency/job))))
        (testing "and the next run was scheduled anyway"
          (is (= 1 (count @scheduled))))))))

(defn- table-dependency-ids
  "The IDs of the tables the `entity-type` entity `entity-id` depends on directly."
  [entity-type entity-id]
  (t2/select-fn-set :to_entity_id :model/Dependency
                    :from_entity_type entity-type :from_entity_id entity-id :to_entity_type :table))

(deftest ^:synchronized backfill-snippet-edit-recomputes-queries-expanding-it-test
  (testing "a snippet's tables are the card's own dependencies, so editing a snippet, even one nested in another,
           recomputes the cards whose SQL expands it"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet {inner-id :id} {:name "birds inner" :content "VENUES"}
                     :model/NativeQuerySnippet _ {:name "birds outer" :content "SELECT * FROM {{snippet: birds inner}}"}
                     :model/Card {card-id :id} {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                 "{{snippet: birds outer}}")}]
        (backfill-all-existing-entities!)
        (is (= #{(mt/id :venues)} (table-dependency-ids :card card-id)))
        (t2/update! :model/NativeQuerySnippet inner-id {:content "CHECKINS"})
        (backfill-all-existing-entities!)
        (is (= #{(mt/id :checkins)} (table-dependency-ids :card card-id)))))))

(deftest ^:synchronized backfill-card-reference-leaves-out-card-tables-test
  (testing "a native query depends on the card it references, not on the card's tables, which it reads through the card"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {orders-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query
                                                   mp
                                                   (format "SELECT * FROM {{#%d}} o JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID"
                                                           orders-id))}]
          (backfill-all-existing-entities!)
          (is (= #{(mt/id :products)} (table-dependency-ids :card card-id)))
          (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :card :to_entity_id orders-id)))))))

(deftest ^:synchronized backfill-records-table-created-later-test
  (testing "a table a native query names before it exists gets its dependency once the table is created"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                 "SELECT * FROM PUBLIC.BIRDS_LATE")}
                     :model/Card {known-id :id} {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                  "SELECT * FROM VENUES")}]
        (backfill-all-existing-entities!)
        (is (empty? (table-dependency-ids :card card-id)))
        (is (true? (t2/select-one-fn :unresolved_tables :model/DependencyStatus :entity_type :card :entity_id card-id)))
        (is (false? (t2/select-one-fn :unresolved_tables :model/DependencyStatus :entity_type :card :entity_id known-id)))
        (mt/with-temp [:model/Table {late-id :id} {:db_id (mt/id) :schema "PUBLIC" :name "BIRDS_LATE" :active true}]
          (backfill-all-existing-entities!)
          (is (= #{late-id} (table-dependency-ids :card card-id)))
          (is (false? (t2/select-one-fn :unresolved_tables :model/DependencyStatus
                                        :entity_type :card :entity_id card-id))))))))
