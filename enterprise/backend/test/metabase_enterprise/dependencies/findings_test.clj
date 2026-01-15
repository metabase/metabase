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
  (mt/with-premium-features #{:dependencies}
    (is (= 0 (deps.findings/analyze-batch! :card 2)))
    (binding [models.analysis-finding/*current-analysis-finding-version* (inc models.analysis-finding/*current-analysis-finding-version*)]
      ;; can't check the actual cards analyzed here because this could be any starting card in the data
      (is (= 2 (deps.findings/analyze-batch! :card 2))))))

(deftest ^:sequential does-not-analyze-native-entities-test
  (testing "assumes native queries are always fine"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "utter nonsense")}]
          (is (= 1 (deps.findings/analyze-batch! :card 1)))
          (is (= [models.analysis-finding/*current-analysis-finding-version* true]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))
