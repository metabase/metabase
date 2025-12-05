(ns metabase-enterprise.representations.v0.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def valid-examples ["test_resources/representations/v0/select-1.metric.yml"])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename valid-examples]
      (testing (str "Validating: " filename)
        (let [rep (rep-yaml/from-file filename)]
          (is (rep-read/parse rep)))))))

(deftest validate-exported-metrics
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Card card {:type :question
                                     :dataset_query (lib/native-query mp "select 2")}]
      (doseq [query [(mt/native-query {:query "select 1"})
                     (mt/mbql-query users)
                     (lib/native-query (mt/metadata-provider) "select 1")
                     (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     (lib/query mp (lib.metadata/card mp (:id card)))]]
        (mt/with-temp [:model/Card metric {:type :metric
                                           :dataset_query query}]
          (let [edn (rep/export metric)
              ;; convert to yaml and read back in to convert keywords to strings, etc
                yaml (rep-yaml/generate-string edn)
                rep (rep-yaml/parse-string yaml)]
            (is (rep-read/parse rep))))))))

(deftest can-import
  (doseq [filename valid-examples]
    (testing (str "Importing: " filename)
      (let [rep (rep-yaml/from-file filename)
            ref-index (-> {(v0-common/unref (:database rep))
                           (t2/select-one :model/Database (mt/id))}
                          (v0-common/map-entity-index))
            instance (rep/insert! rep ref-index)]
        (try
          (is instance)
          (finally
            (t2/delete! :model/Card (:id instance))))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Card :type :metric)]
    (is (= :metric (v0-common/representation-type entity)))))
