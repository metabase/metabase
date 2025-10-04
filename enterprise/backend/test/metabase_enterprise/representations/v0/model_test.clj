(ns metabase-enterprise.representations.v0.model-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

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
      (let [edn (rep/export-with-refs model)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

(deftest can-import
  (doseq [filename ["test_resources/representations/v0/product-performance.model.yml"
                    "test_resources/representations/v0/collection-8/sales-data-enriched.model.yml"
                    "test_resources/representations/v0/collection-8/sales-data.model.yml"]]
    (testing (str "Importing: " filename)
      (let [rep (yaml/from-file filename)]
        (is (rep/persist! rep))))))

(deftest export-import-roundtrip-test
  (testing "Testing export then import roundtrip for models"
    (doseq [query [(mt/native-query {:query "select 1"})
                   (mt/mbql-query users)]]
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query query}]
        (let [card-edn (rep/export-with-refs model)
              card-yaml (yaml/generate-string card-edn)
              card-rep (yaml/parse-string card-yaml)
              card-rep (rep/normalize-representation card-rep)

              ;; For MBQL queries, also export MBQL data
              mbql-edn (when (= :query (:type query))
                         (export/export-mbql-data model))

              ;; For MBQL queries, serialize to YAML and parse back
              mbql-rep (when mbql-edn
                         (let [mbql-yaml (-> mbql-edn export/export-entity yaml/generate-string)
                               parsed (yaml/parse-string mbql-yaml)]
                           (rep/normalize-representation parsed)))

              ;; Build ref-index with database and MBQL data (if present)
              ref-index (cond-> {(v0-common/unref (:database card-edn)) (t2/select-one :model/Database (mt/id))}
                          mbql-rep (assoc (:ref mbql-rep) (rep/persist! mbql-rep nil)))

              model (rep/persist! card-rep ref-index)
              model (t2/select-one :model/Card :id (:id model))
              edn (rep/export-with-refs model)
              yaml (yaml/generate-string edn)
              rep2 (yaml/parse-string yaml)
              rep2 (rep/normalize-representation rep2)]
          ;; For models with MBQL, the mbql_query ref will differ due to new IDs
          ;; So we compare structure excluding :ref and :mbql_query
          (is (=? (dissoc card-rep :ref :mbql_query) (dissoc rep2 :ref :mbql_query)))
          ;; Verify the mbql_query field exists and is a ref string for MBQL models
          (when mbql-rep
            (is (string? (:mbql_query rep2)))
            (is (re-matches #"ref:mbql-model-\d+" (:mbql_query rep2)))))))))

