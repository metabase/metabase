(ns metabase-enterprise.dependencies.task.backfill-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.dependencies.models.dependency :as dependencies.model]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs]
   [toucan2.core :as t2]
   [toucan2.model :as model]
   [toucan2.tools.transformed :as t2.tools.transformed]
   [toucan2.util :as t2.u]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- run-transforms
  [value model-kw direction]
  (reduce (fn [value [field tx]]
            (let [f (direction tx)]
              (cond-> value
                f (m/update-existing field f))))
          value
          (t2.tools.transformed/transforms model-kw)))

(defn- insert-no-t2!
  [model-kw data]
  (let [full-data (-> (mt/with-temp-defaults model-kw)
                      (merge data)
                      (run-transforms model-kw :in))
        insert-query (sql/format {:insert-into (t2/table-name model-kw)
                                  :values      [full-data]})
        id (t2/with-connection [conn]
             (-> (jdbc/execute-one! conn insert-query {:return-keys true
                                                       :builder-fn rs/as-unqualified-lower-maps})
                 :id))]
    (t2/select-one model-kw id)))

(defn- do-with-temp*!
  [model explicit-attributes f]
  (assert (some? model) (format "%s model cannot be nil." `with-temp))
  (when (some? explicit-attributes)
    (assert (map? explicit-attributes) (format "attributes passed to %s must be a map." `with-temp)))
  (t2.u/try-with-error-context ["with temp" {::model               model
                                             ::explicit-attributes explicit-attributes}]
    (let [temp-object (insert-no-t2! model explicit-attributes)]
      (try
        (testing (format "\nwith temporary %s\n" (pr-str model))
          (f temp-object))
        (finally
          (t2/delete! model (:id temp-object)))))))

(defn- do-with-temp-no-t2!
  [modelable attributes f]
  (let [model (model/resolve-model modelable)]
    (do-with-temp*! model attributes f)))

(defmacro ^:private with-temp-no-t2!
  "A simplified version of mt/with-temp that does not run the t2 lifecycle hooks and
  handles only entities with a single :id column as primary key."
  {:style/indent :defn}
  [[modelable temp-object-binding attributes & more] & body]
  `(do-with-temp-no-t2! ~modelable ~attributes
                        (^:once fn* [temp-object#]
                          (let [~(or temp-object-binding '_) temp-object#]
                            ~(if (seq more)
                               `(with-temp-no-t2! ~(vec more) ~@body)
                               `(do ~@body))))))

(defn- backfill-existing-entities []
  (while (#'dependencies.backfill/backfill-dependencies)))

(deftest backfill-dependency-analysis-test
  (testing "Test that the backfill job correctly updates the dependency_analysis_version"
    (mt/with-premium-features #{:dependencies}
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
              (is (true? (#'dependencies.backfill/backfill-dependencies)))
              (is (= 2 (card-count :dependency_analysis_version current-version)))
              ;; second run, should process the last card
              (is (false? (#'dependencies.backfill/backfill-dependencies)))
              (is (= 3 (card-count :dependency_analysis_version current-version)))
              ;; third run, should not process anything
              (is (false? (#'dependencies.backfill/backfill-dependencies)))
              (is (= 3 (card-count :dependency_analysis_version current-version))))))))))

(deftest backfill-transform-test
  (testing "Test that transforms are correctly backfilled"
    (mt/with-premium-features #{:dependencies}
      (backfill-existing-entities)
      (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
        (with-temp-no-t2! [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                      :dependency_analysis_version 0}
                           :model/Transform {transform-id :id} {:name "Test Transform"
                                                                :source {:type "query" :query (mt/mbql-query nil {:source-table (str "card__" card-id)})}
                                                                :target {:type "table" :name "test_table"}
                                                                :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (t2/exists? :model/Transform :id transform-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card      :from_entity_id card-id)))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :transform :from_entity_id transform-id)))
          (#'dependencies.backfill/backfill-dependencies)
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

(deftest backfill-snippet-test
  (testing "Test that cards with snippets are correctly backfilled"
    (mt/with-premium-features #{:dependencies}
      (backfill-existing-entities)
      (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "2")]
        (with-temp-no-t2! [:model/NativeQuerySnippet {snippet-id :id} {:name "my_snippet"
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
          (#'dependencies.backfill/backfill-dependencies)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/NativeQuerySnippet :id snippet-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card :from_entity_id card-id
                          :to_entity_type :snippet :to_entity_id snippet-id)))))))

(deftest backfill-idempotency-test
  (testing "Running the backfill multiple times should be idempotent"
    (mt/with-premium-features #{:dependencies}
      (backfill-existing-entities)
      (with-redefs [env/env (assoc env/env :mb-dependency-backfill-batch-size "1")]
        (with-temp-no-t2! [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)
                                                      :dependency_analysis_version 0}]
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))
          (is (false? (t2/exists? :model/Dependency :from_entity_type :card :from_entity_id card-id
                                  :to_entity_type :table :to_entity_id (mt/id :orders))))
          ;; First run
          (#'dependencies.backfill/backfill-dependencies)
          (is (t2/exists? :model/Card :id card-id
                          :dependency_analysis_version dependencies.model/current-dependency-analysis-version))
          ;; Second run - should not change anything
          (#'dependencies.backfill/backfill-dependencies)
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

(deftest backfill-scheduling-test
  (testing "Test that the backfill job schedules and reschedules itself correctly"
    (mt/with-premium-features #{:dependencies}
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
                  (is (= 3 (card-count :dependency_analysis_version current-version))))))))))))

(deftest backfill-terminal-failure-test
  (testing "Entities should be marked as terminally broken after MAX_RETRIES failures"
    (mt/with-premium-features #{:dependencies}
      (backfill-existing-entities)
      (mt/with-temp [:model/Card {card-id :id} {:dependency_analysis_version 0, :dataset_query (mt/mbql-query orders)}]
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

        (let [update-attempts (volatile! 0)
              failures (inc @#'dependencies.backfill/MAX_RETRIES)]
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
            ;; Fail MAX_RETRIES + 1 times
            (while (< @update-attempts failures)
              (#'dependencies.backfill/backfill-dependencies))))

        ;; Verify card is not processed and is terminally broken
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

        ;; Verify subsequent runs don't process it
        (#'dependencies.backfill/backfill-dependencies)
        (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))))))

(deftest backfill-delayed-retry-test
  (testing "Failed entities should be retried after their delay period expires"
    (mt/with-premium-features #{:dependencies}
      (backfill-existing-entities)
      (let [current-version dependencies.model/current-dependency-analysis-version
            update-attempts (volatile! 0)]
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

            ;; First failure - should be put into retry state
            ;; Fail MAX_RETRIES + 1 times
            (while (zero? @update-attempts)
              (#'dependencies.backfill/backfill-dependencies))
            (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0)))

          ;; Advance time by less than retry delay - should NOT be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 10 :seconds))
            (#'dependencies.backfill/backfill-dependencies))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version 0))

          ;; Advance time by more than retry delay - should be processed
          (mt/with-clock (t/plus (t/zoned-date-time) (t/duration 2 :minutes))
            (#'dependencies.backfill/backfill-dependencies))
          (is (t2/exists? :model/Card :id card-id :dependency_analysis_version current-version)))))))
