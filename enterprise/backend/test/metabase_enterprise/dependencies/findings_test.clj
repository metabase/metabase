(ns metabase-enterprise.dependencies.findings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- backfill-all-entity-analyses! []
  (doseq [model [:card :transform :segment]]
    (while (pos? (deps.findings/analyze-batch! model 100)))))

(deftest ^:sequential can-analyze-entity-batches-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.findings/analyze-batch! :card 2)))
        (is (= #{models.analysis-finding/*current-analysis-finding-version*}
               (t2/select-fn-set :analysis_version
                                 :model/AnalysisFinding
                                 :analyzed_entity_id [:in [card-id other-card-id]]
                                 :analyzed_entity_type :card)))))))

(deftest ^:sequential does-not-repeatedly-analyze-entities-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.findings/analyze-batch! :card 2)))
        (is (= 0 (deps.findings/analyze-batch! :card 2)))))))

(deftest ^:sequential re-analyze-entities-when-analysis-version-bumped-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products (lib.metadata/table mp (mt/id :products))
        orders (lib.metadata/table mp (mt/id :orders))]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.findings/analyze-batch! :card 2)))
        (is (= 0 (deps.findings/analyze-batch! :card 2)))
        (binding [models.analysis-finding/*current-analysis-finding-version* (inc models.analysis-finding/*current-analysis-finding-version*)]
          (is (= 2 (deps.findings/analyze-batch! :card 2))))))))

(deftest ^:sequential does-analyze-native-entities-test
  (testing "failed analysis result is appropriately stored in the appdb"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "utter nonsense")}]
          (is (= 1 (deps.findings/analyze-batch! :card 1)))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

(deftest ^:sequential does-report-errors-for-missing-refs-in-fields-test
  (testing "missing (not inactive) field refs in :fields are reported as findings (GHY-3157)"
    (backfill-all-entity-analyses!)
    (let [mp      (mt/metadata-provider)
          orders  (lib.metadata/table mp (mt/id :orders))
          base    (lib/query mp orders)
          cols    (vec (take 5 (lib/returned-columns base orders)))
          bad-col (-> (first cols)
                      lib/ref
                      (assoc 2 "bad_column"))
          query   (lib/with-fields base (conj cols bad-col))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (is (= 1 (deps.findings/analyze-batch! :card 1)))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

;; TODO: (bshepherdson, 2026-02-05) Add a test like does-not-report-errors-in-removable-refs-test-1-stage-fields for
;; join clause :fields as well. See QUE-3081 and QUE-3044.

(deftest ^:sequential reports-missing-field-in-downstream-card-fields-test
  (testing "Q2 based on Q1 with :fields referencing a column Q1 no longer returns should be reported (GHY-3157)"
    (let [mp      (mt/metadata-provider)
          orders  (lib.metadata/table mp (mt/id :orders))
          q1      (lib/query mp orders)
          q1-cols (lib/returned-columns q1)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {q1-id :id} {:dataset_query q1}]
          ;; Q2: based on Q1, with :fields selecting some columns including ID
          (let [mp2       (lib-be/application-database-metadata-provider (mt/id))
                q1-card   (lib.metadata/card mp2 q1-id)
                q2-base   (lib/query mp2 q1-card)
                q2-cols   (lib/returned-columns q2-base)
                id-col    (some #(when (= (:name %) "ID") %) q2-cols)
                total-col (some #(when (= (:name %) "TOTAL") %) q2-cols)
                q2        (lib/with-fields q2-base [id-col total-col])]
            (mt/with-temp [:model/Card {q2-id :id} {:dataset_query q2}]
              ;; Now update Q1 to remove ID from its result_metadata, simulating Q1 dropping that field
              (let [new-result-metadata (vec (remove #(= (:name %) "ID") q1-cols))]
                (t2/update! :model/Card q1-id {:result_metadata new-result-metadata})
                ;; check-entity on Q2 should find the missing field
                (let [mp3     (lib-be/application-database-metadata-provider (mt/id))
                      results (deps.analysis/check-entity mp3 :card q2-id)]
                  (is (seq results)
                      "Q2 should have findings for the missing ID column from Q1"))))))))))

(defn- stale-map
  "Returns a map of {entity-id stale?} for the given card IDs."
  [card-ids]
  (t2/select-fn->fn :analyzed_entity_id :stale :model/AnalysisFinding
                    :analyzed_entity_type :card
                    :analyzed_entity_id [:in card-ids]))

(deftest ^:sequential analyze-batch-picks-up-missing-analyses-test
  (testing "analyze-batch! picks up entities with no pre-existing AnalysisFinding"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
            (testing "card has no analysis finding initially"
              (is (not (t2/exists? :model/AnalysisFinding
                                   :analyzed_entity_type :card
                                   :analyzed_entity_id card-id))))
            (testing "analyze-batch! creates analysis for the card"
              (lib-be/with-metadata-provider-cache
                (is (pos? (deps.findings/analyze-batch! :card 10)))))
            (testing "card now has an analysis finding"
              (is (t2/exists? :model/AnalysisFinding
                              :analyzed_entity_type :card
                              :analyzed_entity_id card-id)))))))))

(deftest mark-dependents-stale-test
  (testing "mark-dependents-stale! marks direct dependents as stale"
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                           :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id child-card-id
                                                :to_entity_type :card
                                                :to_entity_id parent-card-id}]
              (run! deps.findings/upsert-analysis!
                    (t2/select :model/Card :id [:in [parent-card-id child-card-id]]))
              (is (= {parent-card-id false, child-card-id false}
                     (stale-map [parent-card-id child-card-id]))
                  "neither should be stale before marking")
              (t2/with-transaction [_conn]
                (deps.findings/mark-dependents-stale! :card parent-card-id)
                (is (= {parent-card-id false, child-card-id true}
                       (stale-map [parent-card-id child-card-id]))
                    "parent should NOT be stale, child should be stale")))))))))

(deftest mark-dependents-stale-transitive-test
  (testing "mark-dependents-stale! marks transitive dependents as stale"
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            (mt/with-temp [:model/Card {grandparent-id :id} {:dataset_query (lib/query mp products)}
                           :model/Card {parent-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp grandparent-id))}
                           :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id parent-id
                                                :to_entity_type :card
                                                :to_entity_id grandparent-id}
                           :model/Dependency _ {:from_entity_type :card
                                                :from_entity_id child-id
                                                :to_entity_type :card
                                                :to_entity_id parent-id}]
              (run! deps.findings/upsert-analysis!
                    (t2/select :model/Card :id [:in [grandparent-id parent-id child-id]]))
              (t2/with-transaction [_conn]
                (deps.findings/mark-dependents-stale! :card grandparent-id)
                (is (= {grandparent-id false, parent-id true, child-id true}
                       (stale-map [grandparent-id parent-id child-id]))
                    "grandparent should NOT be stale, parent and child should be stale (transitive)")))))))))
