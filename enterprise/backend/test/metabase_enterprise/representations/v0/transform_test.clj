(ns metabase-enterprise.representations.v0.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def good-yamls ["test_resources/representations/v0/orders-count.transform.yml"
                 "test_resources/representations/v0/orders-count-existing.transform.yml"])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename good-yamls]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep-read/parse rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            []]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep-read/parse rep))))))))

(deftest validate-exported-transforms
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Transform transform {:name "TEST"
                                               :source {:type :query
                                                        :query query}
                                               :target {:type "table"
                                                        :name "output_table"
                                                        :schema "output_schema"}}]
      (let [edn (rep/export transform)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)]
        (is (rep-read/parse rep))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Transform)]
    (is (= :transform (v0-common/representation-type entity)))))
