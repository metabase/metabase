(ns metabase-enterprise.representations.v0.model-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename
            ["test_resources/representations/v0/product-performance.model.yml"
             "test_resources/representations/v0/collection-8/sales-data.model.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep-read/parse rep)))))))

(deftest validate-exported-models
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card model {:type :model
                                      :dataset_query query}]
      (let [edn (rep/export model)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)]
        (is (rep-read/parse rep))))))

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

(deftest representation-type-test
  (doseq [entity (t2/select :model/Card :type :model)]
    (is (= :model (v0-common/representation-type entity)))))
