(ns metabase-enterprise.dependencies.ghy-3151-repro-test
  "Reproduction test for GHY-3151: editing model column metadata on models with
  native-model dependents causes 500 errors because the OverridingMetadataProvider
  wipes result-metadata to nil for all dependents."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.metadata-provider :as deps.mp]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]))

(defn- make-test-providers
  []
  (let [query-a (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp1 (lib.tu/metadata-provider-with-card-from-query meta/metadata-provider 101 query-a)
        card-a (lib.metadata/card mp1 101)
        card-a-cols (lib/returned-columns (lib/query mp1 card-a))
        card-b (deps.tu/mock-card mp1
                                  {:id 102
                                   :query "SELECT * FROM {{#101}}"
                                   :details {:type :model
                                             :result-metadata (mapv #(dissoc % :table-id :id :fk-target-field-id)
                                                                    card-a-cols)}})
        base-mp (lib.tu/mock-metadata-provider mp1 {:cards [card-b]})
        omp (deps.mp/override-metadata-provider
             {:base-provider base-mp
              :updated-entities {:card [(dissoc card-a :result-metadata)]}
              :dependent-ids {:card #{102}}})]
    {:base-mp base-mp
     :omp omp}))

(deftest omp-preserves-native-model-result-metadata-test
  (testing "GHY-3151: OverridingMetadataProvider preserves result-metadata for native model dependents"
    (let [{:keys [base-mp omp]} (make-test-providers)]
      (testing "base provider has result-metadata for the native model"
        (is (seq (:result-metadata (lib.metadata/card base-mp 102)))))
      (testing "OMP preserves result-metadata for native model dependents"
        (is (seq (:result-metadata (lib.metadata/card omp 102))))))))

(deftest compile-succeeds-with-native-model-join-test
  (testing "GHY-3151: compiling a query that joins with a native model dependent succeeds (fix verified)"
    (let [{:keys [base-mp omp]} (make-test-providers)
          join-query {:database (meta/id)
                      :type :query
                      :query {:source-table (meta/id :products)
                              :joins [{:source-table "card__102"
                                       :alias "CardB"
                                       :condition [:= [:field (meta/id :products :id)
                                                       {:base-type :type/BigInteger}]
                                                   [:field "PRODUCT_ID"
                                                    {:base-type :type/Integer
                                                     :join-alias "CardB"}]]
                                       :fields :none}]}}]
      (testing "compiles successfully with the base provider"
        (is (string? (:query (qp.compile/compile-with-inline-parameters
                              (assoc join-query :lib/metadata base-mp))))))
      (testing "compiles successfully with the OMP (result-metadata preserved)"
        (is (string? (:query (qp.compile/compile-with-inline-parameters
                              (assoc join-query :lib/metadata omp)))))))))
