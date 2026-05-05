(ns metabase.queries.metadata-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.queries.metadata :as queries.metadata]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.table :as schema.table]))

(deftest ^:parallel batch-fetch-card-metadata-empty-queries-test
  ;; disable Malli because we want to make sure this works in prod
  (mu/disable-enforcement
    (is (= {:databases [], :fields [], :snippets [], :tables []}
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
          (let [[model-table]     (schema.table/batch-fetch-card-query-metadatas [(:id model)] {})
                [question-table]  (schema.table/batch-fetch-card-query-metadatas [(:id question)] {})
                model-fk-field    (m/find-first #(= (:name %) "COMPUTED_FK") (:fields model-table))
                question-fk-field (m/find-first #(= (:name %) "COMPUTED_FK") (:fields question-table))]
            (testing "Model preserves FK semantic_type for computed columns"
              (is (= :type/FK (:semantic_type model-fk-field))))
            (testing "Model preserves fk_target_field_id for computed columns"
              (is (= target-field-id (:fk_target_field_id model-fk-field))))
            (testing "Question strips FK semantic_type for computed columns (no numeric id)"
              (is (nil? (:semantic_type question-fk-field))))))))))
