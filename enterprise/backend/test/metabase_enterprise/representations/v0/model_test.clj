(ns metabase-enterprise.representations.v0.model-test
  (:require
   #_[metabase-enterprise.representations.import :as import]
   #_[metabase.api.common :as api]
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest type->model-test
  (testing "type->model returns correct model for :model"
    (is (= :model/Card (v0-common/type->model :model)))))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename
            ["test_resources/representations/v0/product-performance.model.yml"
             "test_resources/representations/v0/collection-8/sales-data-enriched.model.yml"
             "test_resources/representations/v0/collection-8/sales-data.model.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/normalize-representation rep)))))))

(deftest validate-exported-models
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card model {:type :model
                                      :dataset_query query}]
      (let [edn (rep/export model)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

;; TODO: replace old stale tests

;; TODO: Need to load sample database first
(deftest can-import
  (doseq [filename ["test_resources/representations/v0/product-performance.model.yml"
                    #_"test_resources/representations/v0/collection-8/sales-data-enriched.model.yml"
                    #_"test_resources/representations/v0/collection-8/sales-data.model.yml"]]
    (testing (str "Importing: " filename)
      (let [rep (yaml/from-file filename)]
        (is (rep/persist! (rep/normalize-representation rep)))))))

;; Dependent on MBQL work (QUE-2667)
#_(deftest export-import-roundtrip-test
    (testing "Testing export then import roundtrip for models"
      (doseq [query [(mt/native-query {:query "select 1"})
                     (mt/mbql-query users)]]
        (mt/with-temp [:model/Card model {:type :model
                                          :dataset_query query}]
          (let [card-edn (rep/export model)
                card-yaml (yaml/generate-string card-edn)
                card-rep (yaml/parse-string card-yaml)
                card-rep (rep/normalize-representation card-rep)
              ;; Build ref-index with database and MBQL data (if present)
                ref-index {(v0-common/unref (:database card-edn)) (t2/select-one :model/Database (mt/id))}
                _ (clojure.pprint/pprint card-rep)
                model (rep/persist! card-rep ref-index)
                model (t2/select-one :model/Card :id (:id model))
                edn (rep/export model)
                yaml (yaml/generate-string edn)
                rep2 (yaml/parse-string yaml)
                rep2 (rep/normalize-representation rep2)]
          ;; For models with MBQL, the mbql_query ref will differ due to new IDs
          ;; So we compare structure excluding :ref and :mbql_query
            (is (=? (dissoc card-rep :ref :mbql_query) (dissoc rep2 :ref :mbql_query))))))))

(deftest export-mbql-model-includes-columns-test
  (testing "MBQL models export user-editable column metadata"
    (mt/with-temp [:model/Card model {:type :model
                                      :dataset_query (mt/mbql-query orders)}]
      (let [exported (export/export-entity model)]
        (testing "Exported representation has columns field"
          (is (contains? exported :columns))
          (is (seq (:columns exported))))
        (testing "Each column has required name field"
          (doseq [col (:columns exported)]
            (is (:name col))))
        (testing "Columns contain only user-editable fields"
          (doseq [col (:columns exported)]
            (is (nil? (:id col)))
            (is (nil? (:table_id col)))
            (is (nil? (:fingerprint col)))
            (is (nil? (:field_ref col)))
            (is (nil? (:base_type col)))
            (is (nil? (:effective_type col)))))))))

#_(deftest import-user-columns-override-base-metadata-test
    (testing "User-edited columns in model.yml override base metadata from mbql.yml"
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (mt/mbql-query orders)}]
        (let [mbql-data (export/export-mbql-data model)
              base-metadata (:result_metadata mbql-data)
              base-subtotal (first (filter #(= "SUBTOTAL" (:name %)) base-metadata))
              original-display-name (:display_name base-subtotal)
              user-columns [{:name "SUBTOTAL"
                             :display_name "Order Total (Pre-Tax)"
                             :description "The subtotal amount before taxes are applied"
                             :semantic_type :type/Currency
                             :settings {:text_align "right" :currency "USD"}}]
              model-rep {:type :v0/model
                         :ref "test-model"
                         :name "Test Model"
                         :database (str "ref:database-" (mt/id))
                         :mbql_query (str "ref:" (:ref mbql-data))
                         :columns user-columns}
              ref-index {(:ref mbql-data) mbql-data
                         (str "database-" (mt/id)) (t2/select-one :model/Database (mt/id))}
              imported (import/yaml->toucan model-rep ref-index)
              imported-metadata (:result_metadata imported)
              imported-subtotal (first (filter #(= "SUBTOTAL" (:name %)) imported-metadata))]
          (testing "User's display_name overrides base"
            (is (= "Order Total (Pre-Tax)" (:display_name imported-subtotal)))
            (is (not= original-display-name (:display_name imported-subtotal))))
          (testing "User's description is added"
            (is (= "The subtotal amount before taxes are applied"
                   (:description imported-subtotal))))
          (testing "User's semantic_type overrides base"
            (is (= :type/Currency (:semantic_type imported-subtotal))))
          (testing "User's settings are merged with base settings"
            (is (= "right" (get-in imported-subtotal [:settings :text_align])))
            (is (= "USD" (get-in imported-subtotal [:settings :currency]))))
          (testing "Base metadata fields are preserved"
            (is (:id imported-subtotal) "Should preserve internal id")
            (is (:field_ref imported-subtotal) "Should preserve field_ref")
            (is (:base_type imported-subtotal) "Should preserve base_type"))))))
#_(deftest roundtrip-preserves-user-edits-test
    (testing "Export → Edit → Import → Export cycle preserves user edits"
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (mt/mbql-query orders)}]
        (let [export-1 (export/export-entity model)
              mbql-data-1 (export/export-mbql-data model)
              original-subtotal-name (-> export-1 :columns
                                         (->> (filter #(= "SUBTOTAL" (:name %))))
                                         first :display_name)
              edited-rep (-> export-1
                             (assoc :type :v0/model)
                             (update :columns
                                     (fn [cols]
                                       (mapv (fn [col]
                                               (if (= "SUBTOTAL" (:name col))
                                                 (assoc col
                                                        :display_name "Pre-Tax Total"
                                                        :description "Total before tax")
                                                 col))
                                             cols))))
              ref-index-1 {(:ref mbql-data-1) mbql-data-1
                           (v0-common/unref (:database edited-rep)) (t2/select-one :model/Database (mt/id))}
              imported (import/yaml->toucan edited-rep ref-index-1)
              persisted (binding [api/*current-user-id* (mt/user->id :crowberto)]
                          (import/persist! edited-rep ref-index-1))
              export-2 (export/export-entity persisted)
              final-subtotal (-> export-2 :columns
                                 (->> (filter #(= "SUBTOTAL" (:name %))))
                                 first)]
          (testing "Original export has original display name"
            (is original-subtotal-name))
          (testing "After import, model has edited values in result_metadata"
            (let [imported-subtotal (first (filter #(= "SUBTOTAL" (:name %))
                                                   (:result_metadata imported)))]
              (is (= "Pre-Tax Total" (:display_name imported-subtotal)))
              (is (= "Total before tax" (:description imported-subtotal)))))
          (testing "Second export preserves the user edits"
            (is (= "Pre-Tax Total" (:display_name final-subtotal)))
            (is (= "Total before tax" (:description final-subtotal))))
          (testing "User edits persist through the full cycle"
            (is (not= original-subtotal-name (:display_name final-subtotal))
                "Final export should have edited name, not original"))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Card :type :model)]
    (is (= :model (v0-common/representation-type entity)))))
