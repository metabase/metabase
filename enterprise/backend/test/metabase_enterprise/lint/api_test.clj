(ns metabase-enterprise.lint.api-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase-enterprise.lint.api :as lint.api]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private cleanup-models
  [:model/Card :model/Dependency :model/DependencyStatus
   :model/AnalysisFinding :model/AnalysisFindingError :model/AnalysisFindingStatus])

(defn- create-model-card!
  "A model of the orders table."
  [user card-name]
  (let [mp (mt/metadata-provider)]
    (card/create-card! {:name                   card-name
                        :database_id            (mt/id)
                        :display                :table
                        :query_type             :query
                        :type                   :model
                        :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        :visualization_settings {}}
                       user)))

(defn- create-model-of-card!
  "A model of everything `source-card` returns."
  [user source-card card-name]
  (let [mp (mt/metadata-provider)]
    (card/create-card! {:name                   card-name
                        :database_id            (mt/id)
                        :display                :table
                        :query_type             :query
                        :type                   :model
                        :dataset_query          (lib/query mp (lib.metadata/card mp (:id source-card)))
                        :visualization_settings {}}
                       user)))

(defn- create-card-filtering-model-total!
  "A question on `model-card` that filters on its TOTAL column, which only the orders table has."
  [user model-card card-name]
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/card mp (:id model-card)))
        total (first (filter #(= (:id %) (mt/id :orders :total)) (lib/filterable-columns query)))]
    (card/create-card! {:name                   card-name
                        :database_id            (mt/id)
                        :display                :table
                        :query_type             :query
                        :type                   :question
                        :dataset_query          (lib/filter query (lib/> total 100))
                        :visualization_settings {}}
                       user)))

(defn- break-model-card!
  "Point `model-card` at the products table, which has no TOTAL column."
  [model-card]
  (let [mp (mt/metadata-provider)]
    (card/update-card! {:card-before-update model-card
                        :card-updates       {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}})))

(defn- lint-report
  "The lint report as Crowberto, which drains the analysis jobs first."
  []
  (mt/user-http-request :crowberto :get 200 "ee/lint"))

(defn- entity-results
  "The results of `report` on the entity with `entity-id`."
  [report entity-id]
  (filterv #(= entity-id (:entity_id %)) (:results report)))

(deftest rules-cover-every-analysis-error-type-test
  (is (= (set (mc/children (mr/resolve-schema ::lib.schema.validate/validate-error-type)))
         (set (keys @#'lint.api/rules)))))

(deftest requires-superuser-test
  (mt/with-premium-features #{:dependencies}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/lint")))))

(deftest ^:synchronized broken-card-with-cause-test
  (testing "GET /api/ee/lint reports an entity broken by another, with that entity as the cause"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "lint@test.com"}]
        (mt/with-model-cleanup cleanup-models
          (let [[model-card dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Lint model")]
                    [model-card (create-card-filtering-model-total! user model-card "Lint dependent")]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
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
                     (entity-results report (:entity_id dependent-card))))
              (is (= {:severity "error" :description "A query reads a column its source does not have."}
                     (get-in report [:rules :missing-column]))))))))))

(deftest ^:synchronized broken-native-sql-without-cause-test
  (testing "GET /api/ee/lint reports native SQL reading an unknown table, with no cause to trace it to"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup cleanup-models
        (mt/with-temp [:model/Card native-card {:name          "Lint native"
                                                :dataset_query (mt/native-query {:query "SELECT * FROM orderz"})}]
          (let [report (lint-report)]
            ;; The detail is the identifier as the test database's parser resolves it: H2 upper-cases it.
            (is (= [{:ruleId    "missing-table-alias"
                     :entity_id (:entity_id native-card)
                     :detail    "ORDERZ"
                     :message   "Native SQL reads ORDERZ, which no known table matches"
                     :cause     nil}]
                   (entity-results report (:entity_id native-card))))))))))

(deftest ^:synchronized archived-and-internal-content-left-out-test
  (testing "GET /api/ee/lint leaves out archived entities and content Metabase manages itself"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "lint@test.com"}]
        (mt/with-model-cleanup cleanup-models
          (let [[model-card archived-card internal-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Lint model")]
                    [model-card
                     (create-card-filtering-model-total! user model-card "Lint archived")
                     (create-card-filtering-model-total! user model-card "Lint internal")]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            (card/update-card! {:card-before-update archived-card :card-updates {:archived true}})
            (t2/update! :model/Card :id (:id internal-card) {:creator_id config/internal-mb-user-id})
            (let [report (lint-report)]
              (is (= [] (entity-results report (:entity_id archived-card))))
              (is (= [] (entity-results report (:entity_id internal-card))))
              (is (not (contains? (:entities report) (keyword (:entity_id archived-card)))))
              (is (not (contains? (:entities report) (keyword (:entity_id internal-card))))))))))))

(deftest ^:synchronized passed-when-nothing-is-broken-test
  (testing "GET /api/ee/lint answers `passed` with no results once a broken entity is fixed"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "lint@test.com"}]
        (mt/with-model-cleanup cleanup-models
          (let [[model-card dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Lint model")]
                    [model-card (create-card-filtering-model-total! user model-card "Lint dependent")]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            (is (= 1 (count (entity-results (lint-report) (:entity_id dependent-card)))))
            (lib-be/with-metadata-provider-cache
              (card/update-card! {:card-before-update (t2/select-one :model/Card :id (:id model-card))
                                  :card-updates       {:dataset_query (:dataset_query model-card)}}))
            (is (= [] (entity-results (lint-report) (:entity_id dependent-card))))))))))

(deftest ^:synchronized broken-through-intermediate-card-test
  (testing "GET /api/ee/lint reports an entity broken through a card whose result metadata has to be re-derived first"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "lint@test.com"}]
        (mt/with-model-cleanup cleanup-models
          (let [[model-card dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card        (create-model-card! user "Lint model")
                        intermediate-card (create-model-of-card! user model-card "Lint intermediate")]
                    [model-card (create-card-filtering-model-total! user intermediate-card "Lint dependent")]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            (let [report (lint-report)]
              (is (= ["missing-column"] (map :ruleId (entity-results report (:entity_id dependent-card))))))))))))

(deftest ^:synchronized fails-when-analysis-cannot-run-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-model-cleanup cleanup-models
      (mt/with-temp [:model/Card native-card {:name          "Lint native"
                                              :dataset_query (mt/native-query {:query "SELECT * FROM orderz"})}]
        (testing "GET /api/ee/lint fails rather than answer from stale findings when a job is disabled"
          (mt/with-temporary-setting-values [dependency-entity-check-batch-size 0]
            (is (= "The analysis cannot run while one of its jobs is disabled by its batch size."
                   (mt/user-http-request :crowberto :get 503 "ee/lint")))))
        (testing "GET /api/ee/lint fails when the app DB is read-only"
          (mt/with-temporary-setting-values [read-only-mode true]
            (is (= "The analysis cannot run while Metabase is in read-only mode."
                   (mt/user-http-request :crowberto :get 503 "ee/lint")))))
        (testing "GET /api/ee/lint runs the analysis once it can"
          (let [report (lint-report)]
            (is (= "failed" (:status report)))
            (is (= 1 (count (entity-results report (:entity_id native-card)))))))))))
