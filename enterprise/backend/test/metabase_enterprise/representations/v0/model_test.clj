(ns metabase-enterprise.representations.v0.model-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]))

(use-fixtures :once (fixtures/initialize :db))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename
            ["test_resources/representations/v0/product-performance.model.yml"
             "test_resources/representations/v0/sales-data-enriched.model.yml"
             "test_resources/representations/v0/sale-data.model.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/normalize-representation rep)))))))

(deftest validate-exported-models
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card model {:type :model
                                      :dataset_query query}]
      (let [edn (rep/export-with-refs model)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep  (yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

(deftest can-import
  (doseq [filename ["test_resources/representations/v0/product-performance.model.yml"
                    "test_resources/representations/v0/sales-data-enriched.model.yml"
                    "test_resources/representations/v0/sale-data.model.yml"]]
    (testing (str "Importing: " filename)
      (let [rep (yaml/from-file filename)]
        (is (rep/persist! rep))))))

