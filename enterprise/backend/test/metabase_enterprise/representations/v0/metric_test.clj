(ns metabase-enterprise.representations.v0.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def valid-examples ["test_resources/representations/v0/select-1.metric.yml"
                     "test_resources/representations/v0/number-of-orders.metric.yml"])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename valid-examples]
      (testing (str "Validating: " filename)
        (let [rep (rep-yaml/from-file filename)]
          (is (rep/normalize-representation rep)))))))

(deftest validate-exported-metrics
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card metric {:type :metric
                                       :dataset_query query}]
      (let [edn (rep/export metric)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (rep-yaml/generate-string edn)
            rep (rep-yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

(deftest can-import
  (doseq [filename valid-examples]
    (testing (str "Importing: " filename)
      (let [rep (rep-yaml/from-file filename)
            ref-index {(v0-common/unref (:database rep))
                       (t2/select-one :model/Database (mt/id))}]
        (is (rep/persist! rep ref-index))))))
