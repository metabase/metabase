(ns metabase-enterprise.lint.api-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
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

(defn- do-with-broken-native-card!
  "Call `f` with a card whose native SQL reads a table that does not exist."
  [f]
  (mt/with-premium-features #{:dependencies}
    (mt/with-model-cleanup cleanup-models
      (mt/with-temp [:model/Card native-card {:name          "Lint native"
                                              :dataset_query (mt/native-query {:query "SELECT * FROM orderz"})}]
        (f native-card)))))

(defn- lint-report
  "The lint report as Crowberto, which drains the analysis jobs first."
  []
  (mt/user-http-request :crowberto :post 200 "ee/lint"))

(defn- card-results
  "The results of `report` on `card`."
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

(deftest ^:synchronized passed-when-nothing-is-broken-test
  (testing "POST /api/ee/lint answers `passed` with no results once a broken entity is fixed"
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
       (mt/with-temporary-setting-values [dependency-entity-check-batch-size 0]
         (is (= "The analysis cannot run while one of its jobs is disabled by its batch size."
                (mt/user-http-request :crowberto :post 503 "ee/lint")))))
     (testing "POST /api/ee/lint fails when the app DB is read-only"
       (mt/with-temporary-setting-values [read-only-mode true]
         (is (= "The analysis cannot run while Metabase is in read-only mode."
                (mt/user-http-request :crowberto :post 503 "ee/lint")))))
     (testing "POST /api/ee/lint runs the analysis once it can"
       (let [report (lint-report)]
         (is (= "failed" (:status report)))
         (is (= 1 (count (card-results report native-card)))))))))
