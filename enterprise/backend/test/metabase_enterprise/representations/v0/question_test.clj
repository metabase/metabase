(ns metabase-enterprise.representations.v0.question-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def good-yamls ["test_resources/representations/v0/monthly-revenue.question.yml"
                 ;;"test_resources/representations/v0/pokemon-cards-limited.question.yml"
                 "test_resources/representations/v0/collection-8/pokemon-cards.question.yml"
                 "test_resources/representations/v0/collection-8/sales-data.question.yml"
                 "test_resources/representations/v0/collection-8/trainers.question.yml"])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename good-yamls]
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

#_(deftest import-export
    (testing "Testing import then export roundtrip"
      (let [db (t2/select-one :model/Database)]
        (doseq [filename good-yamls]
          (testing (str "Importing-Exporting: " filename)
            (println filename)
            (let [rep (rep/import-yaml filename)
                  rep (assoc rep :database (:name db))]
              (with-redefs [v0-common/find-database-id (fn [_] (:id db))]
                (let [persisted (rep/persist! rep)]
                  (is persisted)
                  (let [question (t2/select-one :model/Card :id (:id persisted))
                        edn (rep/export question)

                        yaml (yaml/generate-string edn)
                        rep2 (yaml/parse-string yaml)]
                    (is (=? (dissoc rep :ref) rep2)))))))))))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (doseq [query [(mt/native-query {:query "select 1"})
                   (mt/mbql-query users)]]
      (prn query)
      (mt/with-temp [:model/Card question {:type :question
                                           :dataset_query query}]
        (let [edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep (yaml/parse-string yaml)
              rep (rep/validate rep)
              _ (clojure.pprint/pprint rep)
              t2 (rep/yaml->toucan rep)
              _ (clojure.pprint/pprint t2)
              question (rep/persist! rep)
              question (t2/select-one :model/Card :id (:id question))
              _ (clojure.pprint/pprint question)
              edn (rep/export question)
              yaml (yaml/generate-string edn)
              rep2 (yaml/parse-string yaml)

              rep2 (rep/validate rep2)]
          (is (=? (dissoc rep :ref) rep2)))))))
