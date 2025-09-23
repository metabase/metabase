(ns metabase-enterprise.representations.v0.question-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename
            ["test_resources/representations/v0/monthly-revenue.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/validate rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            ["test_resources/representations/v0/invalid.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep/validate rep))))))))

(deftest validate-exported-questions
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card question {:type :question
                                         :dataset_query query}]
      (let [edn (rep/export question)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep  (yaml/parse-string yaml)]
        (is (rep/validate rep))))))

(deftest can-import
  (let [filename "test_resources/representations/v0/monthly-revenue.question.yml"
        rep (yaml/from-file filename)]
    (is (rep/persist! rep))))

(deftest import-export
  (testing "Testing import then export roundtrip"
    (doseq [filename
            ["test_resources/representations/v0/monthly-revenue.question.yml"]]
      (testing (str "Importing-Exporting: " filename)
        (let [rep (yaml/from-file filename)
              persisted (rep/persist! rep)]
          (is persisted)
          (let [question (t2/select-one :model/Card :id (:id persisted))
                edn (rep/export question)
                yaml (yaml/generate-string edn)
                rep2 (yaml/parse-string yaml)]
            (is (=? (dissoc rep :ref) rep2))))))))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (doseq [query [(mt/native-query {:query "select 1"})
                   (mt/mbql-query users)]]
      (mt/with-temp [:model/Card question {:type :question
                                           :dataset_query query}]
        (let [edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep (yaml/parse-string yaml)
              question (rep/persist! rep)
              question (t2/select-one :model/Card :id (:id question))
              edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep2 (yaml/parse-string yaml)]
          (is (=? (dissoc rep :ref) rep2)))))))
