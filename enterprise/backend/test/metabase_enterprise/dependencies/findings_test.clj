(ns metabase-enterprise.dependencies.findings-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
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

(deftest ^:parallel reports-missing-field-in-downstream-card-fields-test
  (testing "Q2 based on Q1 with :fields referencing a column Q1 no longer returns should be reported (GHY-3157)"
    (let [mp          meta/metadata-provider
          q1          (lib/query mp (meta/table-metadata :orders))
          q1-cols     (lib/returned-columns q1)
          removed-col (m/find-first #(= (:name %) "ID") q1-cols)
          ;; Card 101 = Q1 with ID removed from result-metadata (simulates Q1 dropping that field)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 101 q1
                       {:result-metadata (vec (remove #(= (:name %) "ID") q1-cols))})
          ;; Q2: query based on card 101, with :fields including the now-missing ID
          q2-base     (lib/query mp {:lib/type :metadata/card :id 101})
          q2-cols     (lib/returned-columns q2-base)
          q2          (lib/with-fields q2-base (conj (vec q2-cols) (lib/ref removed-col)))
          ;; Card 102 = Q2 (provide result-metadata explicitly since q2 has a bad ref)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 102 q2
                       {:result-metadata (vec q2-cols)})
          results     (deps.analysis/check-entity mp :card 102)]
      (is (seq results)
          "Q2 should have findings for the missing ID column from Q1"))))

(defn- stale-map
  "Returns a map of {entity-id stale?} for the given card IDs."
  [card-ids]
  (t2/select-fn->fn :analyzed_entity_id :stale :model/AnalysisFinding
                    :analyzed_entity_type :card
                    :analyzed_entity_id [:in card-ids]))

(defn- finding-stale?
  "Returns the stale value for a specific entity's analysis finding, or nil if no finding exists."
  [entity-type entity-id]
  (t2/select-one-fn :stale :model/AnalysisFinding
                    :analyzed_entity_type entity-type
                    :analyzed_entity_id entity-id))

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

(deftest ^:sequential wave-propagation-via-entity-check-test
  (testing "analyze-and-propagate! marks immediate dependents stale, and the job loop drains them in waves"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            (mt/with-temp [:model/Card {gp-id :id :as gp-card} {:dataset_query (lib/query mp products)}
                           :model/Card {p-id :id :as p-card} {:dataset_query (lib/query mp (lib.metadata/card mp gp-id))}
                           :model/Card {c-id :id :as c-card} {:dataset_query (lib/query mp (lib.metadata/card mp p-id))}
                           :model/Dependency _ {:from_entity_type :card :from_entity_id p-id
                                                :to_entity_type :card :to_entity_id gp-id}
                           :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                                :to_entity_type :card :to_entity_id p-id}]
              ;; Analyze all three so they have findings
              (run! deps.findings/upsert-analysis! [gp-card p-card c-card])
              (is (= {gp-id false, p-id false, c-id false}
                     (stale-map [gp-id p-id c-id]))
                  "all should start as not stale")
              ;; Mark only the immediate dependents of grandparent (just parent, not child)
              (deps.findings/mark-immediate-dependents-stale! :card gp-id)
              (is (= {gp-id false, p-id true, c-id false}
                     (stale-map [gp-id p-id c-id]))
                  "only parent should be stale (immediate), child should NOT be stale yet")
              ;; Run the entity-check job loop — it should analyze parent, which marks child stale,
              ;; then analyze child in the next wave
              (#'task.entity-check/check-entities!)
              (is (= {gp-id false, p-id false, c-id false}
                     (stale-map [gp-id p-id c-id]))
                  "after check-entities!, all should be re-analyzed (not stale) — wave propagation worked"))))))))

(deftest ^:sequential wave-propagation-through-non-analyzable-entity-test
  (testing "Wave propagation skips non-analyzable intermediaries (e.g., tables) and reaches cards beyond them"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          products-id (mt/id :products)]
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (mt/with-model-cleanup [:model/AnalysisFinding]
            ;; Chain: transform → (depends on) table ← (depends on) card
            ;; Table is not analyzable, but card should still be reached by the wave
            (mt/with-temp [:model/Transform {transform-id :id :as transform}
                           {:source {:type :query :query (lib/query mp products)}
                            :name "test_wave_transform"
                            :target {:schema "public" :name "wave_test_table" :type :table}}
                           :model/Card {card-id :id :as card}
                           {:dataset_query (lib/query mp products)}
                           ;; table depends on transform (downstream of transform)
                           :model/Dependency _ {:from_entity_type :table :from_entity_id products-id
                                                :to_entity_type :transform :to_entity_id transform-id}
                           ;; card depends on the same table
                           :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                                :to_entity_type :table :to_entity_id products-id}]
              ;; Analyze the transform and card (tables aren't analyzable)
              (deps.findings/upsert-analysis! transform)
              (deps.findings/upsert-analysis! card)
              (is (false? (finding-stale? :card card-id))
                  "card should start as not stale")
              ;; Mark only immediate dependents of transform stale
              ;; The immediate dependent is the table, which is NOT analyzable
              ;; The card is two hops away: transform → table → card
              (deps.findings/mark-immediate-dependents-stale! :transform transform-id)
              ;; The look-through should have reached the card through the non-analyzable table
              (is (true? (finding-stale? :card card-id))
                  "card should be stale — look-through reached it via non-analyzable table")
              ;; Run entity-check to drain stale entities
              (#'task.entity-check/check-entities!)
              (is (false? (finding-stale? :card card-id))
                  "card should be re-analyzed after entity-check"))))))))
