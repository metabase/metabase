(ns metabase-enterprise.representations.v0.question-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def good-yamls ["test_resources/representations/v0/monthly-revenue.question.yml"
                 ;;"test_resources/representations/v0/pokemon-cards-limited.question.yml"
                 ;;"test_resources/representations/v0/collection-8/pokemon-cards.question.yml"
                 ;;"test_resources/representations/v0/collection-8/sales-data.question.yml"
                 ;;"test_resources/representations/v0/collection-8/trainers.question.yml"
                 ])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename good-yamls]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/normalize-representation rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            ["test_resources/representations/v0/invalid.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep/normalize-representation rep))))))))

(deftest validate-exported-questions
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card question {:type :question
                                         :dataset_query query}]
      (let [edn (rep/export question)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep  (yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

(deftest can-import
  (let [filename "test_resources/representations/v0/monthly-revenue.question.yml"
        rep (yaml/from-file filename)
        ref-index {(v0-common/unref (:database rep))
                   (t2/select-one :model/Database (mt/id))}]
    (is (rep/persist! rep ref-index))))

(deftest import-export
  (testing "Testing import then export roundtrip"
    (doseq [filename good-yamls]
      (testing (str "Importing-Exporting: " filename)
        (let [rep (import/import-yaml filename)
              ref-index {(v0-common/unref (:database rep))
                         (t2/select-one :model/Database (mt/id))}
              persisted (rep/persist! rep ref-index)]
          (is persisted)
          (let [question (t2/select-one :model/Card :id (:id persisted))
                edn (rep/export question)

                yaml (yaml/generate-string edn)
                rep2 (yaml/parse-string yaml)]
            (is (=? (dissoc rep :ref :databaseq) rep2))))))))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (doseq [query [(mt/native-query {:query "select 1"})
                   (mt/mbql-query users)]]
      (mt/with-temp [:model/Card question {:type :question
                                           :dataset_query query}]
        (let [edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep (yaml/parse-string yaml)
              rep (rep/normalize-representation rep)
              ref-index {(v0-common/unref (:database edn)) (t2/select-one :model/Database (mt/id))}
              question (rep/persist! rep ref-index)
              question (t2/select-one :model/Card :id (:id question))
              edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep2 (yaml/parse-string yaml)

              rep2 (rep/normalize-representation rep2)]
          (is (=? (dissoc rep :ref) rep2)))))))

(deftest export-import-refs)
