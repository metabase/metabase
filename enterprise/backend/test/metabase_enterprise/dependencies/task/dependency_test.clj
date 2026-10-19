(ns metabase-enterprise.dependencies.task.dependency-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.dependencies.task.dependency-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.hooks :as deps.hooks]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
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

(defn- forget-status!
  "Delete the dependency status of an entity, so the dependency job computes its dependencies again."
  [entity-type entity-id]
  (dependencies.db/delete-dependency-statuses! entity-type [entity-id]))

(def ^:private pending? deps.test/dependency-pending?)

(defn- processed?
  "Whether the dependency job computed the dependencies of the entity `entity-type` `entity-id` with the current logic
  and nothing marked them stale since."
  [entity-type entity-id]
  (and (t2/exists? :model/DependencyStatus
                   :entity_type entity-type
                   :entity_id entity-id
                   :analysis_version dependencies.model/current-dependency-analysis-version)
       (not (pending? entity-type entity-id))))

(defn- assert-pending
  "Assert that the dependency job is to compute the dependencies of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (is (pending? entity-type entity-id)
      (str "Expected " (name entity-type) " " entity-id " to be pending")))

(defn- assert-processed
  "Assert that an entity has been processed."
  [entity-type entity-id]
  (is (processed? entity-type entity-id)
      (str "Expected " (name entity-type) " " entity-id " to be processed")))

(deftest ^:synchronized backfill-dependency-analysis-test
  (testing "the dependency job processes the pending entities in batches, asking to run again while a batch took any"
    (backfill-all-existing-entities!)
    (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
      (let [query (mt/mbql-query orders)]
        (mt/with-premium-features #{}
          (mt/with-temp [:model/Card {card1-id :id} {:dataset_query query}
                         :model/Card {card2-id :id} {:dataset_query query}
                         :model/Card {card3-id :id} {:dataset_query query}]
            (forget-status! :card card1-id)
            (forget-status! :card card2-id)
            (forget-status! :card card3-id)
            (let [pending-count (fn [] (count (filter #(pending? :card %) [card1-id card2-id card3-id])))]
              (is (= 3 (pending-count)))
              ;; first run, should process 2 cards
              (is (true? (backfill-dependencies-single-trigger!)))
              (is (= 1 (pending-count)))
              ;; second run, should process the last card
              (is (true? (backfill-dependencies-single-trigger!)))
              (is (= 0 (pending-count)))
              ;; third run, should not process anything
              (is (nil? (backfill-dependencies-single-trigger!)))
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
          (forget-status! :card card-id)
          (forget-status! :transform transform-id)
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
          (forget-status! :card card-id)
          (forget-status! :snippet snippet-id)
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
        (forget-status! :snippet inner-id)
        (forget-status! :snippet outer-id)
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
        (forget-status! :card card-id)
        (forget-status! :snippet snippet-id)
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
          (forget-status! :card card-id)
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
                (forget-status! :card card1-id)
                (forget-status! :card card2-id)
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
  (testing "When calculate-deps throws, the error is logged and the entity is computed again on the next run"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (forget-status! :card card-id)
        (with-redefs [env/env (assoc env/env
                                     :mb-dependency-backfill-delay-minutes "0"
                                     :mb-dependency-backfill-variance-minutes "0")
                      deps.calculation/calculate-deps
                      (fn [_ _] (throw (ex-info "Simulated error" {})))]
          (backfill-dependencies-single-trigger!))
        (is (empty? (t2/select :model/Dependency :from_entity_type :card :from_entity_id card-id)))
        (is (pending? :card card-id))))))

(deftest ^:synchronized backfill-partial-batch-failure-test
  (testing "A failure on one entity doesn't prevent other entities from being processed"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {good-card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/Card {bad-card-id :id} {:dataset_query (mt/mbql-query products)}]
        (forget-status! :card good-card-id)
        (forget-status! :card bad-card-id)
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
        (is (pending? :card bad-card-id))))))

(deftest ^:synchronized backfill-failure-waits-for-change-test
  (testing "An entity whose calculation keeps failing is given up on after dependency-max-failures runs, until it changes"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (forget-status! :card card-id)
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps
                                    (fn [_ _] (throw (ex-info "Simulated computation error" {:card-id card-id})))]
          (dotimes [_ (deps.settings/dependency-max-failures)]
            (backfill-dependencies-single-trigger!)))
        (is (not (pending? :card card-id)))
        (is (empty? (t2/select :model/Dependency :from_entity_type :card :from_entity_id card-id)))
        (forget-status! :card card-id)
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)))))

(deftest backfill-card-does-not-cause-revision-test
  (testing "backfilling a card does not create a new revision or audit log entry"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies :audit-app}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (forget-status! :card card-id)
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
          (forget-status! :card card1-id)
          (forget-status! :card card2-id)
          (forget-status! :card card3-id)
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
        (t2/update! :model/DependencyStatus :entity_type :card :entity_id card-id {:analysis_version 0})
        (backfill-dependencies-single-trigger!)
        (assert-processed :card card-id)
        (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                        :to_entity_type :table :to_entity_id (mt/id :orders)))))))

(deftest ^:synchronized backfill-no-status-row-test
  (testing "Entities with no dependency_status row yet get picked up and processed by the backfill"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
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

(deftest ^:synchronized batch-size-zero-disables-job-test
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
          (forget-status! :card card1-id)
          (forget-status! :card card2-id)
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

(deftest ^:synchronized fatal-error-gives-up-after-max-failures-test
  (testing "GHY-4251: a fatal Error propagates and counts as a failure, so an entity that keeps causing one is given up
           on after dependency-max-failures runs instead of replaying the batch in a crash loop"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (forget-status! :card card-id)
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps (fn [& _] (throw (Error. "simulated fatal error")))]
          (dotimes [run (deps.settings/dependency-max-failures)]
            (testing (str "run " (inc run) ": the Error propagates instead of being swallowed")
              (is (thrown-with-msg? Error #"simulated fatal error" (backfill-dependencies-single-trigger!))))
            (testing (str "run " (inc run) ": the entity stays pending until the last allowed failure")
              (is (= (< (inc run) (deps.settings/dependency-max-failures)) (pending? :card card-id))))))
        (testing "a write gives the entity fresh attempts"
          (dependencies.db/mark-dependency-statuses-stale! {:card #{card-id}})
          (is (pending? :card card-id)))))))

(deftest ^:synchronized failing-entity-gives-up-after-max-failures-test
  (testing "an entity with no dependency_status row yet whose computation keeps failing is retried until
           dependency-max-failures, then given up on until it changes"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
        (is (not (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id))
            "test setup: the card must have no status row, which is what makes it eligible")
        (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps (fn [& _] (throw (ex-info "boom" {})))]
          (backfill-dependencies-single-trigger!)
          (is (pending? :card card-id))
          (dotimes [_ (dec (deps.settings/dependency-max-failures))]
            (backfill-dependencies-single-trigger!)))
        (is (not (pending? :card card-id)))
        (is (=? {:terminal true :fail_count (deps.settings/dependency-max-failures)}
                (t2/select-one :model/DependencyStatus :entity_type :card :entity_id card-id)))))))

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

(deftest ^:synchronized snippet-new-upstream-marks-analysis-test
  (testing "storing a new upstream of a snippet marks the analysis of what expands it, which an edit of that upstream
           before the edge existed never marked"
    (backfill-all-existing-entities!)
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet _ {:name "window inner" :content "VENUES"}
                     :model/NativeQuerySnippet {outer-id :id} {:name "window outer" :content "SELECT * FROM VENUES"}
                     :model/Card {card-id :id} {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                 "{{snippet: window outer}}")}]
        (backfill-all-existing-entities!)
        (t2/update! :model/NativeQuerySnippet outer-id {:content "SELECT * FROM {{snippet: window inner}}"})
        (deps.test/record-analysis-finding-processed! :card card-id)
        (backfill-dependencies-single-trigger!)
        (is (deps.test/analysis-finding-pending? :card card-id))))))

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

(deftest dashboard-update-sets-correct-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (let [products-id (mt/id :products)
           orders-id (mt/id :orders)
           products (lib.metadata/table mp products-id)
           orders (lib.metadata/table mp orders-id)
           category-field (lib.metadata/field mp (mt/id :products :category))]
       (mt/with-temp [:model/Card {basic-card-id :id} {:dataset_query (lib/query mp products)}
                      :model/Card {series-card-id :id} {:dataset_query (lib/query mp orders)}
                      :model/Card {param-source-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                                 (lib/aggregate (lib/count))
                                                                                 (lib/breakout category-field))}
                      :model/Dashboard {dashboard-id :id} {:parameters [{:id "category-param"
                                                                         :type "category"
                                                                         :values_source_type "card"
                                                                         :values_source_config {:card_id param-source-card-id}}]}
                      :model/DashboardCard {basic-dashcard-id :id} {:dashboard_id dashboard-id
                                                                    :card_id basic-card-id}
                      :model/DashboardCardSeries _ {:dashboardcard_id basic-dashcard-id
                                                    :card_id series-card-id
                                                    :position 0}]
         (assert-pending :dashboard dashboard-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id basic-card-id}
                   {:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id series-card-id}
                   {:from_entity_type :dashboard
                    :from_entity_id dashboard-id
                    :to_entity_type :card
                    :to_entity_id param-source-card-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))
         (t2/delete! :model/DashboardCard :id basic-dashcard-id)
         (t2/update! :model/Dashboard dashboard-id {:parameters []})
         (mt/with-temp [:model/Card {scalar-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                             (lib/aggregate (lib/count)))
                                                          :display :scalar}
                        :model/Card {scalar-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id scalar-card-id
                                                :visualization_settings {:click_behavior {:type "link"
                                                                                          :linkType "question"
                                                                                          :targetId scalar-click-target-card-id}}}
                        :model/Card {scalar-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                               (lib/aggregate (lib/count)))
                                                            :display :scalar}
                        :model/Dashboard {scalar-click-target-dashboard-id :id} {}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id scalar-card-2-id
                                                :visualization_settings {:click_behavior {:type "link"
                                                                                          :linkType "dashboard"
                                                                                          :targetId scalar-click-target-dashboard-id}}}
                        :model/Card {table-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                            (lib/breakout category-field)
                                                                            (lib/aggregate (lib/count)))
                                                         :display :table}
                        :model/Card {column-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id table-card-id
                                                :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                       :linkType "question"
                                                                                                                                       :targetId column-click-target-card-id}}}}}
                        :model/Dashboard {column-click-target-dashboard-id :id} {}
                        :model/Card {table-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                              (lib/breakout category-field)
                                                                              (lib/aggregate (lib/count)))
                                                           :display :table}
                        :model/DashboardCard _ {:dashboard_id dashboard-id
                                                :card_id table-card-2-id
                                                :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                       :linkType "dashboard"
                                                                                                                                       :targetId column-click-target-dashboard-id}}}}}]
           (deps.test/synchronously-run-dependency-job!)
           (is (=? #{{:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-click-target-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id scalar-card-2-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :dashboard
                      :to_entity_id scalar-click-target-dashboard-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id table-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id column-click-target-card-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :card
                      :to_entity_id table-card-2-id}
                     {:from_entity_type :dashboard
                      :from_entity_id dashboard-id
                      :to_entity_type :dashboard
                      :to_entity_id column-click-target-dashboard-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))
           (t2/delete! :model/Dashboard dashboard-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id :from_entity_type :dashboard)))))))))

(deftest document-update-sets-correct-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (let [products-id (mt/id :products)
           products (lib.metadata/table mp products-id)]
       (mt/with-premium-features #{:dependencies}
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {embedded-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dashboard {dashboard-id :id} {}
                        :model/Document {document-id :id :as document} {:content_type "application/json+vnd.prose-mirror"
                                                                        :document {:type "doc"
                                                                                   :content [{:type "paragraph"
                                                                                              :content [{:type "smartLink"
                                                                                                         :attrs {"entityId" card-id
                                                                                                                 "model" "card"}}]}
                                                                                             {:type "cardEmbed"
                                                                                              :attrs {"id" embedded-card-id}}]}}]
           (assert-pending :document document-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? #{{:from_entity_type :document
                      :from_entity_id document-id
                      :to_entity_type :card
                      :to_entity_id card-id}
                     {:from_entity_type :document
                      :from_entity_id document-id
                      :to_entity_type :card
                      :to_entity_id embedded-card-id}}
                   (into #{} (map #(dissoc % :id)
                                  (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))
           (let [updated-doc (assoc document :document {:type "doc"
                                                        :content [{:type "paragraph"
                                                                   :content [{:type "smartLink"
                                                                              :attrs {"entityId" dashboard-id
                                                                                      "model" "dashboard"}}
                                                                             {:type "smartLink"
                                                                              :attrs {"entityId" products-id
                                                                                      "model" "table"}}]}]})]
             (t2/update! :model/Document document-id updated-doc)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? #{{:from_entity_type :document
                        :from_entity_id document-id
                        :to_entity_type :dashboard
                        :to_entity_id dashboard-id}
                       {:from_entity_type :document
                        :from_entity_id document-id
                        :to_entity_type :table
                        :to_entity_id products-id}}
                     (into #{} (map #(dissoc % :id)
                                    (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document)))))
             (t2/delete! :model/Document document-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (empty? (t2/select :model/Dependency :from_entity_id document-id :from_entity_type :document))))))))))

(deftest sandbox-update-sets-correct-dependencies
  (mt/with-premium-features #{:sandboxes}
    (deps.test/run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "sandbox group"}
                      :model/Card {card1-id :id} {}
                      :model/Card {card2-id :id} {}
                      :model/Sandbox {sandbox-id :id :as sandbox} {:group_id group-id
                                                                   :table_id (mt/id :products)
                                                                   :card_id card1-id}]
         (assert-pending :sandbox sandbox-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card1-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/update! :model/Sandbox sandbox-id (assoc sandbox :card_id card2-id))
         (deps.test/synchronously-run-dependency-job!)
         (is (=? #{{:from_entity_type :sandbox
                    :from_entity_id sandbox-id
                    :to_entity_type :card
                    :to_entity_id card2-id}}
                 (into #{} (map #(dissoc % :id)
                                (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox)))))
         (t2/delete! :model/Sandbox sandbox-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (empty? (t2/select :model/Dependency :from_entity_id sandbox-id :from_entity_type :sandbox))))))))

(deftest card-marks-pending-on-create-and-stale-on-update-test
  (testing "a created card is pending for the dependency job, and any update makes it pending again"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
           (assert-pending :card card-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :products)))
           (is (not (pending? :card card-id)))
           (t2/update! :model/Card card-id {:dataset_query (lib/query mp orders)})
           (assert-pending :card card-id)))))))

(deftest metric-dimensions-update-marks-stale-and-includes-mapped-table-test
  (testing "a metric dimension write marks the metric card stale and recomputes deps, including mapped-dimension tables"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [base (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/aggregate (lib/count)))]
         (mt/with-temp [:model/Card {card-id :id} {:type :metric :dataset_query base}]
           ;; Set the mappings after insert: a freshly-inserted metric with nil `:dimensions` counts as
           ;; uncurated, so the after-insert dimension auto-sync would seed dimensions from the query and
           ;; overwrite mappings passed to with-temp. A plain update sticks — the after-update hook only
           ;; re-syncs when `:dataset_query` changes.
           (t2/update! :model/Card card-id
                       {:dimension_mappings [{:type         :table
                                              :dimension-id "550e8400-e29b-41d4-a716-446655440000"
                                              :table-id     (mt/id :categories)
                                              :target       [:field {} (mt/id :categories :name)]}]})
           (assert-pending :card card-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :categories))
               "the mapped dimension's table becomes a dependency")
           (is (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                           :to_entity_type :table :to_entity_id (mt/id :venues))
               "the query's own table remains a dependency")))))))

(deftest snippet-marks-pending-on-create-and-stale-on-update-test
  (testing "a created snippet is pending for the dependency job, and changing its content makes it pending again"
    (deps.test/run-with-dependencies-setup!
     (fn [_]
       (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "test snippet"
                                                                  :content "SELECT 1"}]
         (assert-pending :snippet snippet-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (not (pending? :snippet snippet-id)))
         (t2/update! :model/NativeQuerySnippet snippet-id {:content "SELECT 2"})
         (assert-pending :snippet snippet-id))))))

(deftest ^:synchronized native-transform-create-sets-dependencies-test
  (testing "a created native transform is picked up by the dependency calculation"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized mbql-transform-create-sets-dependencies-test
  (testing "a created mbql transform is picked up by the dependency calculation"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     :type :query}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized python-transform-create-sets-dependencies-test
  (testing "a created python transform is picked up by the dependency calculation"
    (deps.test/run-with-dependencies-setup!
     (fn [_]
       (let [source {:type :python,
                     :source-database (mt/id),
                     :source-tables [{:alias "orders"
                                      :database_id (mt/id)
                                      :schema "public"
                                      :table "orders"
                                      :table_id (mt/id :orders)}],
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}]
         (mt/with-temp [:model/Transform {transform-id :id} {:source source}]
           (assert-pending :transform transform-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (=? [{:from_entity_type :transform,
                     :from_entity_id transform-id,
                     :to_entity_type :table,
                     :to_entity_id (mt/id :orders)}]
                   (t2/select :model/Dependency :from_entity_id transform-id :from_entity_type :transform)))))))))

(deftest ^:synchronized transform-run-updates-dependencies-test
  (testing "transform run events trigger dependency calculations"
    (deps.test/run-with-dependencies-setup!
     (fn [_]
       (let [target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}     {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Transform {transform-id :id} {:target target}]
           (deps.hooks/after-transform-run transform-id table-id)
           (is (=? [{:from_entity_type :table
                     :from_entity_id table-id,
                     :to_entity_type :transform,
                     :to_entity_id transform-id}]
                   (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform)))))))))

(deftest ^:synchronized python-transform-update-handles-downstream-dependencies-test
  (testing "python transform updates handle downstream dependencies"
    (deps.test/run-with-dependencies-setup!
     (fn [_]
       (let [source {:type :python,
                     :source-database (mt/id),
                     :source-tables [{:alias "orders"
                                      :database_id (mt/id)
                                      :schema "public"
                                      :table "orders"
                                      :table_id (mt/id :orders)}],
                     :body
                     "import pandas as pd\n\ndef transform(orders):\n    return orders"}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}                  {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table     {}                              {:schema "Other", :db_id (mt/id), :name "test_table2"}
                        :model/Transform {transform-id :id} {:target target
                                                             :source source}]
           (testing "initial run"
             (deps.hooks/after-transform-run transform-id table-id)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "keeping target"
             (t2/update! :model/Transform transform-id {:source (update source :body str "\n")})
             (assert-pending :transform transform-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
             (deps.test/synchronously-run-dependency-job!)
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest ^:synchronized query-transform-update-handles-downstream-dependencies-test
  (testing "query transform updates handle downstream dependencies"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [source {:query (lib/native-query mp "select * from orders")
                     :type :query}
             target {:type "table", :schema "Other", :name "test_table", :database (mt/id)}]
         (mt/with-temp [:model/Table     {table-id :id}                  {:schema "Other", :db_id (mt/id), :name "test_table"}
                        :model/Table     {}                              {:schema "Other", :db_id (mt/id), :name "test_table2"}
                        :model/Transform {transform-id :id} {:target target :source source}]
           (testing "initial run"
             (deps.hooks/after-transform-run transform-id table-id)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "keeping target"
             (t2/update! :model/Transform transform-id {:source (assoc source :query (lib/native-query mp "select * from orders limit 10"))})
             (assert-pending :transform transform-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (=? [{:from_entity_type :table
                       :from_entity_id table-id,
                       :to_entity_type :transform,
                       :to_entity_id transform-id}]
                     (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))
           (testing "changing target update"
             (t2/update! :model/Transform transform-id {:target (assoc target :name "test_table2")})
             (deps.test/synchronously-run-dependency-job!)
             (is (empty?
                  (t2/select :model/Dependency :to_entity_id transform-id :to_entity_type :transform))))))))))

(deftest segment-update-sets-correct-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)
           category-field-id (mt/id :products :category)]
       (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                       :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a segment creates dependency to its table"
           (assert-pending :segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{{:from_entity_type :segment
                     :from_entity_id segment-id
                     :to_entity_type :table
                     :to_entity_id products-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))
         (testing "updating segment definition recalculates dependencies"
           (t2/update! :model/Segment segment-id {:definition {:filter [:= [:field category-field-id nil] "Widget"]}})
           (assert-pending :segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{{:from_entity_type :segment
                     :from_entity_id segment-id
                     :to_entity_type :table
                     :to_entity_id products-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment))))))
         (testing "deleting segment removes all dependencies"
           (t2/delete! :model/Segment segment-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (t2/select :model/Dependency :from_entity_id segment-id :from_entity_type :segment)))))))))

(deftest card-with-segment-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [_]
     (let [products-id (mt/id :products)
           price-field-id (mt/id :products :price)]
       (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                       :definition {:filter [:> [:field price-field-id nil] 50]}}]
         (testing "creating a card using a segment creates dependencies to both segment and table"
           (deps.test/synchronously-run-dependency-job!)
           (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                     :type :query
                                                                     :query {:source-table products-id
                                                                             :filter [:segment segment-id]}}}]
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :card
                       :from_entity_id card-id
                       :to_entity_type :segment
                       :to_entity_id segment-id}
                      {:from_entity_type :card
                       :from_entity_id card-id
                       :to_entity_type :table
                       :to_entity_id products-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card))))))))))))

(deftest measure-update-sets-correct-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (mt/with-test-user :rasta
       (let [orders-id (mt/id :orders)
             orders (lib.metadata/table mp orders-id)
             quantity (lib.metadata/field mp (mt/id :orders :quantity))
             subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
         (mt/with-temp [:model/Measure {measure-id :id} {:table_id orders-id
                                                         :definition (-> (lib/query mp orders)
                                                                         (lib/aggregate (lib/sum quantity)))}]
           (testing "creating a measure creates dependency to its table"
             (assert-pending :measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :measure
                       :from_entity_id measure-id
                       :to_entity_type :table
                       :to_entity_id orders-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))
           (testing "updating measure definition recalculates dependencies"
             (t2/update! :model/Measure measure-id {:definition (-> (lib/query mp orders)
                                                                    (lib/aggregate (lib/sum subtotal)))})
             (assert-pending :measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{{:from_entity_type :measure
                       :from_entity_id measure-id
                       :to_entity_type :table
                       :to_entity_id orders-id}}
                    (into #{} (map #(dissoc % :id)
                                   (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))
           (testing "deleting measure removes all dependencies"
             (t2/delete! :model/Measure measure-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (empty? (t2/select :model/Dependency :from_entity_id measure-id :from_entity_type :measure))))))))))

(deftest action-update-sets-correct-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (let [action-deps (fn [action-id]
                         (t2/select-fn-set (juxt :to_entity_type :to_entity_id)
                                           :model/Dependency :from_entity_type :action :from_entity_id action-id))
           sql-query   #(lib/native-query mp (str "DELETE FROM " % " WHERE id = 1"))]
       (mt/with-temp [:model/Action {action-id :id} {:type :query, :name "Delete row"}
                      :model/QueryAction _ {:action_id     action-id
                                            :database_id   (mt/id)
                                            :dataset_query (sql-query "venues")}]
         (testing "creating an action creates dependencies on the tables its query reads"
           (assert-pending :action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:table (mt/id :venues)]}
                  (action-deps action-id))))
         (testing "updating an action's query recalculates its dependencies"
           (t2/update! :model/QueryAction action-id {:dataset_query (sql-query "checkins")})
           (assert-pending :action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:table (mt/id :checkins)]}
                  (action-deps action-id))))
         (testing "deleting an action removes its dependencies and status"
           (t2/delete! :model/Action action-id)
           (deps.test/synchronously-run-dependency-job!)
           (is (empty? (action-deps action-id)))
           (is (not (t2/exists? :model/DependencyStatus :entity_type :action :entity_id action-id)))))))))

(defn- action-dependency-rows
  "The Dependency and DependencyStatus rows of the actions with `action-ids`."
  [action-ids]
  {:dependencies (set (t2/select-fn-set :from_entity_id :model/Dependency
                                        :from_entity_type :action :from_entity_id [:in action-ids]))
   :statuses     (set (t2/select-fn-set :entity_id :model/DependencyStatus
                                        :entity_type :action :entity_id [:in action-ids]))})

(deftest model-delete-removes-dependency-rows-of-its-actions-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                    :model/Action {implicit-id :id} {:type :implicit, :name "Create venue", :model_id model-id}
                    :model/ImplicitAction _ {:action_id implicit-id, :kind "row/create"}
                    :model/Action {query-id :id} {:type :query, :name "Delete venue", :model_id model-id}
                    :model/QueryAction _ {:action_id     query-id
                                          :database_id   (mt/id)
                                          :dataset_query (lib/native-query mp "DELETE FROM venues WHERE id = 1")}]
       (deps.test/synchronously-run-dependency-job!)
       (testing "the model's actions have dependency rows"
         (is (= {:dependencies #{implicit-id query-id}, :statuses #{implicit-id query-id}}
                (action-dependency-rows [implicit-id query-id]))))
       (testing "deleting the model removes the dependency rows of its actions"
         (t2/delete! :model/Card model-id)
         (deps.test/synchronously-run-dependency-job!)
         (is (= {:dependencies #{}, :statuses #{}}
                (action-dependency-rows [implicit-id query-id]))))))))

(deftest database-delete-removes-dependency-rows-of-its-models-actions-test
  (deps.test/run-with-dependencies-setup!
   (fn [_mp]
     (mt/with-temp [:model/Database {db-id :id} {:engine :h2, :details (:details (mt/db))}
                    :model/Table {table-id :id} {:db_id db-id, :name "VENUES", :schema "PUBLIC"}]
       (let [db-mp (lib-be/application-database-metadata-provider db-id)]
         (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                    :database_id   db-id
                                                    :dataset_query (lib/native-query db-mp "SELECT * FROM venues")}
                        :model/Action {implicit-id :id} {:type :implicit, :name "Create venue", :model_id model-id}
                        :model/ImplicitAction _ {:action_id implicit-id, :kind "row/create"}
                        :model/Action {query-id :id} {:type :query, :name "Delete venue", :model_id model-id}
                        :model/QueryAction _ {:action_id     query-id
                                              :database_id   db-id
                                              :dataset_query (lib/native-query db-mp "DELETE FROM venues WHERE id = 1")}]
           (deps.test/synchronously-run-dependency-job!)
           (testing "the actions of the database's model have status rows"
             (is (= #{implicit-id query-id}
                    (:statuses (action-dependency-rows [implicit-id query-id])))))
           (testing "deleting the database removes the dependency rows of the actions of its models"
             (t2/delete! :model/Database db-id)
             (deps.test/synchronously-run-dependency-job!)
             (is (= {:dependencies #{}, :statuses #{}}
                    (action-dependency-rows [implicit-id query-id]))))
           (is (some? table-id))))))))

(deftest measure-with-measure-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (let [orders-id (mt/id :orders)
           orders (lib.metadata/table mp orders-id)
           quantity (lib.metadata/field mp (mt/id :orders :quantity))
           subtotal (lib.metadata/field mp (mt/id :orders :subtotal))]
       (mt/with-temp [:model/Measure {measure1-id :id} {:table_id orders-id
                                                        :definition (-> (lib/query mp orders)
                                                                        (lib/aggregate (lib/sum quantity)))}]
         (let [mp' (mt/metadata-provider)]
           (mt/with-temp [:model/Measure {measure2-id :id} {:table_id orders-id
                                                            :definition (-> (lib/query mp' orders)
                                                                            (lib/aggregate (lib/+ (lib.metadata/measure mp' measure1-id)
                                                                                                  (lib/sum subtotal))))}]
             (testing "creating a measure that references another measure creates dependencies to both"
               (deps.test/synchronously-run-dependency-job!)
               (is (= #{{:from_entity_type :measure
                         :from_entity_id measure2-id
                         :to_entity_type :table
                         :to_entity_id orders-id}
                        {:from_entity_type :measure
                         :from_entity_id measure2-id
                         :to_entity_type :measure
                         :to_entity_id measure1-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id measure2-id :from_entity_type :measure)))))))))))))

(deftest card-with-measure-dependencies
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (let [orders-id (mt/id :orders)
           orders (lib.metadata/table mp orders-id)
           quantity (lib.metadata/field mp (mt/id :orders :quantity))]
       (mt/with-temp [:model/Measure {measure-id :id} {:table_id orders-id
                                                       :definition (-> (lib/query mp orders)
                                                                       (lib/aggregate (lib/sum quantity)))}]
         (deps.test/synchronously-run-dependency-job!)
         (testing "creating a card using a measure creates dependencies to both measure and table"
           (let [mp' (mt/metadata-provider)
                 query (-> (lib/query mp' orders)
                           (lib/aggregate (lib.metadata/measure mp' measure-id)))]
             (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
               (deps.test/synchronously-run-dependency-job!)
               (is (= #{{:from_entity_type :card
                         :from_entity_id card-id
                         :to_entity_type :measure
                         :to_entity_id measure-id}
                        {:from_entity_type :card
                         :from_entity_id card-id
                         :to_entity_type :table
                         :to_entity_id orders-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id card-id :from_entity_type :card)))))))))))))

(deftest serdes-load-recalculates-changed-entities-test
  (testing "a serdes load recalculates the dependencies of the entities it changes, and only those"
    (deps.test/run-with-dependencies-setup!
     (fn [mp]
       (let [card-deps #(t2/select-fn-set (juxt :to_entity_type :to_entity_id)
                                          :model/Dependency :from_entity_type :card :from_entity_id %)
             query     #(lib/query mp (lib.metadata/table mp (mt/id %)))
             load!     #(serdes/with-cache
                          (serdes.load/load-metabase! (ts/ingestion-in-memory %) :reindex? false))]
         (mt/with-temp [:model/Card {card-id :id :as card} {:dataset_query (query :products)}
                        :model/Card {other-id :id}         {:dataset_query (query :products)}]
           (let [exported (serdes/extract-one "Card" {} card)]
             (t2/update! :model/Card card-id {:dataset_query (query :orders)})
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{[:table (mt/id :orders)]} (card-deps card-id)))
             (load! [exported])
             (testing "only the changed card is pending"
               (assert-pending :card card-id)
               (is (not (pending? :card other-id))))
             (deps.test/synchronously-run-dependency-job!)
             (is (= #{[:table (mt/id :products)]} (card-deps card-id))))))))))

(deftest ^:synchronized new-upstream-marks-analysis-test
  (testing "storing a new upstream of an entity marks its analysis stale, since one done before the edge missed the
           upstream's changes"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingStatus :model/DependencyStatus]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (deps.test/table-query :orders)}
                       :model/Card {card-id :id}   {:dataset_query (deps.test/table-query :venues)}]
          (deps.test/synchronously-run-dependency-job!)
          (t2/update! :model/Card card-id {:dataset_query (deps.test/card-query source-id)})
          (deps.test/record-analysis-finding-processed! :card card-id)
          (deps.test/synchronously-run-dependency-job!)
          (is (deps.test/analysis-finding-pending? :card card-id)))))))
