(ns metabase-enterprise.representations.v0.metric-test
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
            []]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/validate rep)))))))

(deftest validate-exported-metrics
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card model {:type :model
                                      :dataset_query query}]
      (let [edn (rep/export model)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep  (yaml/parse-string yaml)]
        (is (rep/validate rep))))))

(deftest can-import
  (doseq [filename []]
    (testing (str "Importing: " filename)
      (let [rep (yaml/from-file filename)]
        (is (rep/persist! rep))))))

