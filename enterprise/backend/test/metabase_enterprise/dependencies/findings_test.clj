(ns metabase-enterprise.dependencies.findings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- backfill-all-entity-analyses! []
  (doseq [model [:card :transform]]
    (while (> (deps.findings/analyze-batch! model 100) 0))))

(deftest can-analyze-entity-batches-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.findings/analyze-batch! :card 2)))
        (is (= #{models.analysis-finding/current-analysis-version}
               (t2/select-fn-set :analysis_version
                                 :model/AnalysisFinding
                                 :analyzed_entity_id [:in [card-id other-card-id]]
                                 :analyzed_entity_type :card)))))))

(deftest does-not-repeatedly-analyze-entities-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.findings/analyze-batch! :card 2)))
        (is (= 0 (deps.findings/analyze-batch! :card 2)))))))

(deftest re-analyze-entities-when-analysis-version-bumped-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (is (= 0 (deps.findings/analyze-batch! :card 2)))
      (binding [models.analysis-finding/current-analysis-version (inc models.analysis-finding/current-analysis-version)]
        ;; can't check the actual cards analyzed here because this could be any starting card in the data
        (is (= 2 (deps.findings/analyze-batch! :card 2)))))))
