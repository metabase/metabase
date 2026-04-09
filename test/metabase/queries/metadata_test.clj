(ns metabase.queries.metadata-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.metadata :as queries.metadata]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.table :as schema.table]))

(deftest ^:parallel batch-fetch-card-metadata-empty-queries-test
  ;; disable Malli because we want to make sure this works in prod
  (mu/disable-enforcement
    (is (= {:databases [], :fields [], :snippets [], :tables [], :cards []}
           (queries.metadata/batch-fetch-card-metadata [{}])))))

(deftest only-models-trust-fk-semantic-types-test
  (testing "FK semantic types set by user should be preserved for models but stripped for questions"
    (let [target-field-id (mt/id :orders :product_id)
          ;; Create result_metadata with a computed column (no numeric :id) that has FK set
          ;; This simulates a user setting FK on a column that doesn't map to a real database field
          result-metadata [{:name               "COMPUTED_FK"
                            :display_name       "Computed FK"
                            :base_type          :type/Integer
                            :semantic_type      :type/FK
                            :fk_target_field_id target-field-id}
                           {:name         "OTHER"
                            :display_name "Other"
                            :base_type    :type/Text}]
          model-data      {:name            "Test Model"
                           :type            :model
                           :database_id     (mt/id)
                           :dataset_query   (mt/mbql-query users)
                           :result_metadata result-metadata}]
      (mt/with-temp [:model/Card model    model-data
                     :model/Card question (assoc model-data
                                                 :name "Test Question"
                                                 :type :question)]
        (mt/with-test-user :crowberto
          (let [[model]           (schema.table/batch-fetch-card-query-metadatas [(:id model)])
                [saved-question]  (schema.table/batch-fetch-card-query-metadatas [(:id question)])
                model-fk-field    (m/find-first #(= (:name %) "COMPUTED_FK") (:result_metadata model))
                question-fk-field (m/find-first #(= (:name %) "COMPUTED_FK") (:result_metadata saved-question))]
            (testing "Model preserves FK semantic_type for computed columns"
              (is (= :type/FK (:semantic_type model-fk-field))))
            (testing "Model preserves fk_target_field_id for computed columns"
              (is (= target-field-id (:fk_target_field_id model-fk-field))))
            (testing "Question strips FK semantic_type for computed columns (no numeric id)"
              (is (nil? (:semantic_type question-fk-field))))))))))

(deftest include-implicit-join-tables-test
  (testing "Should return tables for implicit joins"
    (let [mp (mt/metadata-provider)]
      (mt/with-test-user :crowberto
        (mt/with-temp [:model/Card orders-card   {:name          "Orders Card"
                                                  :database_id   (mt/id)
                                                  :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card products-card {:name          "Products Card"
                                                  :database_id   (mt/id)
                                                  :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}]
          (is (=? {:cards  [{:name "Orders Card"}
                            {:name "Products Card"}]
                   :tables [{:name "ORDERS"}
                            {:name "PEOPLE"}
                            {:name "PRODUCTS"}]}
                  (queries.metadata/batch-fetch-query-metadata
                   [(-> (lib/query mp (lib.metadata/card mp (:id orders-card)))
                        (lib/join (lib.metadata/card mp (:id products-card))))]))))))))
