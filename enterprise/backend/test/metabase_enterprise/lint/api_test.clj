(ns metabase-enterprise.lint.api-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.lint.api :as lint.api]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private cleanup-models
  [:model/Card :model/Dependency :model/DependencyStatus
   :model/AnalysisFinding :model/AnalysisFindingError :model/AnalysisFindingStatus])

(defn- create-card!
  [user card-name card-type query]
  (card/create-card! {:name                   card-name
                      :database_id            (mt/id)
                      :display                :table
                      :query_type             :query
                      :type                   card-type
                      :dataset_query          query
                      :visualization_settings {}}
                     user))

(defn- create-card-filtering-total!
  "A question on `source-card` that filters on its TOTAL column, which only the orders table has."
  [user source-card card-name]
  (let [query (deps.test/card-query (:id source-card))
        total (first (filter #(= (:id %) (mt/id :orders :total)) (lib/filterable-columns query)))]
    (create-card! user card-name :question (lib/filter query (lib/> total 100)))))

(defn- update-card-query!
  [card query]
  (lib-be/with-metadata-provider-cache
    (card/update-card! {:card-before-update card :card-updates {:dataset_query query}})))

(defn- do-with-broken-model!
  "Call `f` with a model of the orders table and what `create-dependents!` builds on it, once the model is pointed at
  the products table, which has no TOTAL column."
  [create-dependents! f]
  (mt/with-premium-features #{:dependencies}
    (mt/with-temp [:model/User user {:email "lint@test.com"}]
      (mt/with-model-cleanup cleanup-models
        (let [[model-card dependents]
              (lib-be/with-metadata-provider-cache
                (let [model-card (create-card! user "Lint model" :model (deps.test/table-query :orders))]
                  [model-card (create-dependents! user model-card)]))]
          (update-card-query! model-card (deps.test/table-query :products))
          (f model-card dependents))))))

(defn- do-with-native-card!
  "Call `f` with a card whose native SQL is `sql`."
  [sql f]
  (mt/with-premium-features #{:dependencies}
    (mt/with-model-cleanup cleanup-models
      (mt/with-temp [:model/Card native-card {:name          "Lint native"
                                              :dataset_query (mt/native-query {:query sql})}]
        (f native-card)))))

(defn- do-with-broken-native-card!
  "Call `f` with a card whose native SQL reads a table that does not exist."
  [f]
  (do-with-native-card! "SELECT * FROM orderz" f))

(defn- do-with-plain-native-card!
  "Call `f` with a card whose native SQL is fine."
  [f]
  (do-with-native-card! "SELECT 1" f))

(defn- lint-report
  "The lint report as Crowberto, which drains the analysis jobs first."
  []
  (mt/user-http-request :crowberto :post 200 "ee/lint"))

(defn- card-results
  [report card]
  (filterv #(= (:entity_id card) (:entity_id %)) (:results report)))

(deftest rules-cover-every-analysis-error-type-test
  (is (= (set (mc/children (mr/resolve-schema ::lib.schema.validate/validate-error-type)))
         (set (keys @#'lint.api/rules)))))

(deftest every-analysis-error-type-has-a-message-test
  (doseq [error-type (mc/children (mr/resolve-schema ::lib.schema.validate/validate-error-type))
          detail     [nil "DETAIL"]
          cause      [nil
                      {:type :card, :id 1, :entity_id "entity-id", :name "Cause"}
                      {:type :card, :id 1, :entity_id nil, :name nil}]]
    (testing (pr-str error-type detail cause)
      (is (string? (#'lint.api/message {:type error-type, :detail detail, :cause cause}))))))

(defn- status-and-summary
  "The status and summary of the report of `failed` entities. The endpoint's cover the whole app DB, where other
  namespaces may leave failing entities."
  [failed]
  (select-keys (#'lint.api/report failed) [:status :summary]))

(deftest ^:synchronized report-status-and-summary-test
  (testing "the report passes with zero counts when no entity failed"
    (is (= {:status :passed :summary {:errors 0 :warnings 0 :entities 0}}
           (status-and-summary []))))
  (testing "the report fails and counts one error on one entity for one broken card"
    (do-with-broken-native-card!
     (fn [native-card]
       (deps.findings/drain-pending!)
       (is (= {:status :failed :summary {:errors 1 :warnings 0 :entities 1}}
              (status-and-summary (filterv #(= (:entity_id native-card) (:entity_id %))
                                           (deps.findings/failed-entities)))))))))

(deftest requires-superuser-test
  (mt/with-premium-features #{:dependencies}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/lint")))))

(deftest ^:synchronized broken-card-with-cause-test
  (testing "POST /api/ee/lint reports an entity broken by another, with that entity as the cause"
    (do-with-broken-model!
     #(create-card-filtering-total! %1 %2 "Lint dependent")
     (fn [model-card dependent-card]
       ;; No job runs in between: the endpoint drains the pending analysis itself.
       (let [report (lint-report)]
         (is (= "failed" (:status report)))
         (is (= {:id   (:id dependent-card)
                 :type "card"
                 :data {:name "Lint dependent" :collection_id nil}}
                (get-in report [:entities (keyword (:entity_id dependent-card))])))
         (is (= [{:ruleId    "missing-column"
                  :entity_id (:entity_id dependent-card)
                  :detail    "TOTAL"
                  :message   "Column TOTAL is not on card \"Lint model\""
                  :cause     {:type      "card"
                              :id        (:id model-card)
                              :entity_id (:entity_id model-card)
                              :name      "Lint model"}}]
                (card-results report dependent-card)))
         (is (= {:severity "error" :description "A query reads a column its source does not have."}
                (get-in report [:rules :missing-column]))))))))

(deftest ^:synchronized broken-native-sql-without-cause-test
  (testing "POST /api/ee/lint reports native SQL reading an unknown table, with no cause to trace it to"
    (do-with-broken-native-card!
     (fn [native-card]
       ;; The detail is the identifier as the test database's parser resolves it: H2 upper-cases it.
       (is (= [{:ruleId    "missing-table-alias"
                :entity_id (:entity_id native-card)
                :detail    "ORDERZ"
                :message   "Native SQL reads ORDERZ, which no known table matches"
                :cause     nil}]
              (card-results (lint-report) native-card)))))))

(deftest ^:synchronized archived-and-internal-content-left-out-test
  (testing "POST /api/ee/lint leaves out archived entities and content Metabase manages itself"
    (do-with-broken-model!
     (fn [user model-card]
       [(create-card-filtering-total! user model-card "Lint archived")
        (create-card-filtering-total! user model-card "Lint internal")])
     (fn [_model-card [archived-card internal-card]]
       (card/update-card! {:card-before-update archived-card :card-updates {:archived true}})
       (t2/update! :model/Card :id (:id internal-card) {:creator_id config/internal-mb-user-id})
       (let [report (lint-report)]
         (doseq [card [archived-card internal-card]]
           (is (= [] (card-results report card)))
           (is (not (contains? (:entities report) (keyword (:entity_id card)))))))))))

(deftest ^:synchronized fixed-entity-no-longer-reported-test
  (testing "POST /api/ee/lint stops reporting an entity once it is fixed"
    (do-with-broken-model!
     #(create-card-filtering-total! %1 %2 "Lint dependent")
     (fn [model-card dependent-card]
       (is (= 1 (count (card-results (lint-report) dependent-card))))
       (update-card-query! (t2/select-one :model/Card :id (:id model-card)) (:dataset_query model-card))
       (is (= [] (card-results (lint-report) dependent-card)))))))

(deftest ^:synchronized broken-through-intermediate-card-test
  (testing "POST /api/ee/lint reports an entity broken through a card whose result metadata has to be re-derived first"
    (do-with-broken-model!
     (fn [user model-card]
       (let [intermediate-card (create-card! user "Lint intermediate" :model (deps.test/card-query (:id model-card)))]
         (create-card-filtering-total! user intermediate-card "Lint dependent")))
     (fn [_model-card dependent-card]
       (is (= ["missing-column"] (map :ruleId (card-results (lint-report) dependent-card))))))))

(deftest ^:synchronized fails-when-analysis-cannot-run-test
  (do-with-broken-native-card!
   (fn [native-card]
     (testing "POST /api/ee/lint fails rather than answer from stale findings when a job is disabled"
       (deps.findings/drain-pending!)
       (dependencies.db/mark-dependency-statuses-stale! {:card #{(:id native-card)}})
       (mt/with-temporary-setting-values [dependency-entity-check-batch-size 0]
         (is (= "The analysis cannot run while one of its jobs is disabled by its batch size."
                (mt/user-http-request :crowberto :post 503 "ee/lint"))))
       (testing "before the jobs ahead of the disabled one run"
         (is (pos? (t2/select-one-fn :stale :model/DependencyStatus :entity_type :card :entity_id (:id native-card))))))
     (testing "POST /api/ee/lint fails when the app DB is read-only"
       (mt/with-temporary-setting-values [read-only-mode true]
         (is (= "The analysis cannot run while Metabase is in read-only mode."
                (mt/user-http-request :crowberto :post 503 "ee/lint")))))
     (testing "POST /api/ee/lint runs the analysis once it can"
       (let [report (lint-report)]
         (is (= "failed" (:status report)))
         (is (= 1 (count (card-results report native-card)))))))))

(defn- do-with-uncomputable-dependencies!
  "Call `f` while computing the dependencies of `card` throws."
  [card f]
  (let [calculate-deps (mt/original-fn #'deps.calculation/calculate-deps)]
    (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps (fn [entity-type entity]
                                                                  (if (and (= :card entity-type) (= (:id card) (:id entity)))
                                                                    (throw (ex-info "Dependencies broke" {}))
                                                                    (calculate-deps entity-type entity)))]
      (f))))

(deftest ^:synchronized uncomputable-dependencies-fail-test
  (testing "POST /api/ee/lint reports an entity whose dependencies cannot be computed"
    (do-with-plain-native-card!
     (fn [card]
       (do-with-uncomputable-dependencies!
        card
        (fn []
          (let [report (lint-report)]
            (is (= "failed" (:status report)))
            (is (= [{:ruleId    "validation-exception-error"
                     :entity_id (:entity_id card)
                     :detail    "Dependencies broke"
                     :message   "Metabase could not check this entity: Dependencies broke"
                     :cause     nil}]
                   (card-results report card))))))))))

(deftest ^:synchronized recomputed-dependencies-clear-failure-test
  (testing "POST /api/ee/lint stops reporting an entity once its given-up dependencies compute again"
    (do-with-plain-native-card!
     (fn [card]
       (let [mark-stale! #(dependencies.db/mark-dependency-statuses-stale! {:card #{(:id card)}})]
         (is (= [] (card-results (lint-report) card)))
         (mark-stale!)
         (do-with-uncomputable-dependencies!
          card
          #(is (= ["validation-exception-error"] (map :ruleId (card-results (lint-report) card)))))
         (mark-stale!)
         (is (= [] (card-results (lint-report) card))))))))

(defn- give-up-on-dependencies!
  "Break `card`'s SQL and drain while its dependencies cannot be computed, so the dependency job gives up on it."
  [card]
  (do-with-uncomputable-dependencies!
   card
   (fn []
     (update-card-query! card (mt/native-query {:query "SELECT * FROM orderz"}))
     (deps.findings/drain-pending!)))
  (is (:terminal (t2/select-one :model/DependencyStatus :entity_type :card :entity_id (:id card)))))

(def ^:private given-up-results
  [{:ruleId  "validation-exception-error"
    :detail  "Could not compute the dependencies of this entity."
    :message "Metabase could not check this entity: Could not compute the dependencies of this entity."
    :cause   nil}])

(deftest ^:synchronized entity-given-up-without-finding-fails-test
  (testing "POST /api/ee/lint fails on an entity given up on without a failed finding, as before findings were recorded"
    (do-with-plain-native-card!
     (fn [card]
       (is (= [] (card-results (lint-report) card)))
       (mt/with-dynamic-fn-redefs [deps.analysis-finding/record-failed-finding! (constantly nil)]
         (give-up-on-dependencies! card))
       (is (= given-up-results (map #(dissoc % :entity_id) (card-results (lint-report) card))))))))

(deftest ^:synchronized give-up-finding-write-failure-fails-test
  (testing "POST /api/ee/lint fails on an entity whose failed finding could not be written when it was given up on"
    (do-with-plain-native-card!
     (fn [card]
       (is (= [] (card-results (lint-report) card)))
       (let [upsert-analysis! (mt/original-fn #'models.analysis-finding/upsert-analysis!)]
         (mt/with-dynamic-fn-redefs [models.analysis-finding/upsert-analysis!
                                     (fn [entity-type entity-id result details]
                                       (if (and (= (:id card) entity-id) (not result))
                                         (throw (ex-info "Finding write broke" {}))
                                         (upsert-analysis! entity-type entity-id result details)))]
           (give-up-on-dependencies! card)))
       (is (= given-up-results (map #(dissoc % :entity_id) (card-results (lint-report) card))))))))

(deftest ^:synchronized failed-finding-without-errors-fails-test
  (testing "POST /api/ee/lint fails on an entity whose stored finding failed with no error recorded"
    (do-with-plain-native-card!
     (fn [card]
       (is (= [] (card-results (lint-report) card)))
       (t2/update! :model/AnalysisFinding :entity_type :card :entity_id (:id card) {:result false})
       (is (= [{:ruleId    "validation-exception-error"
                :entity_id (:entity_id card)
                :detail    "No error was recorded for this entity."
                :message   "Metabase could not check this entity: No error was recorded for this entity."
                :cause     nil}]
              (card-results (lint-report) card)))
       (is (= {:status :failed :summary {:errors 1 :warnings 0 :entities 1}}
              (status-and-summary (filterv #(= (:entity_id card) (:entity_id %))
                                           (deps.findings/failed-entities)))))))))

(deftest ^:synchronized unknown-error-type-fails-test
  (testing "POST /api/ee/lint fails on a stored error of a type it does not know, and still reports other entities"
    (do-with-broken-native-card!
     (fn [broken-card]
       (do-with-plain-native-card!
        (fn [card]
          (is (= [] (card-results (lint-report) card)))
          (t2/update! :model/AnalysisFinding :entity_type :card :entity_id (:id card) {:result false})
          (t2/insert! (t2/table-name :model/AnalysisFindingError) {:analyzed_entity_type "card"
                                                                   :analyzed_entity_id   (:id card)
                                                                   :error_type           "validate-missing-column"
                                                                   :error_detail         "TOTAL"})
          (let [report (lint-report)]
            (is (= [{:ruleId    "validation-exception-error"
                     :entity_id (:entity_id card)
                     :detail    "Unknown error type validate-missing-column: TOTAL"
                     :message   "Metabase could not check this entity: Unknown error type validate-missing-column: TOTAL"
                     :cause     nil}]
                   (card-results report card)))
            (is (= ["missing-table-alias"] (map :ruleId (card-results report broken-card)))))))))))

(deftest ^:synchronized unreadable-entity-fails-test
  (testing "POST /api/ee/lint reports an entity whose stored row cannot be read, without failing the request"
    (do-with-plain-native-card!
     (fn [card]
       (t2/update! (t2/table-name :model/Card) :id (:id card) {:parameters "[5]"})
       (try
         (let [report (lint-report)]
           (is (= "failed" (:status report)))
           (is (= ["validation-exception-error"] (map :ruleId (card-results report card)))))
         (finally
           (t2/update! (t2/table-name :model/Card) :id (:id card) {:parameters "[]"})))))))
