(ns metabase-enterprise.representations.v0.question-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def singleton-yamls ["test_resources/representations/v0/singletons/monthly-revenue.question.yml"])

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename singleton-yamls]
      (testing (str "Validating: " filename)
        (let [rep (rep-yaml/from-file filename)]
          (is (rep/normalize-representation rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            ["test_resources/representations/v0/invalid.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (rep-yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep-read/parse rep))))))))

(deftest validate-exported-questions
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Card question {:type :question
                                         :dataset_query query}]
      (let [edn (rep/export question)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (rep-yaml/generate-string edn)
            rep (rep-yaml/parse-string yaml)]
        (is (rep-read/parse rep))))))

(deftest can-import
  (let [filename "test_resources/representations/v0/monthly-revenue.question.yml"
        rep (rep-yaml/from-file filename)
        ref-index (v0-common/map-entity-index
                   {(v0-common/unref (:database rep))
                    (t2/select-one :model/Database (mt/id))})
        instance (rep/insert! rep ref-index)]
    (try
      (is instance)
      (finally
        (t2/delete! :model/Card (:id instance))))))

(deftest database-import-test
  (mt/with-temp [:model/Card question {:type :question
                                       :dataset_query (mt/mbql-query users)}]
    (let [edn (rep/export question)
          export-set (export/export-set [edn])
          export-set (export/reduce-tables export-set)
          db-ref (v0-common/unref (:database edn))
          idx (into {} (map (juxt :name identity)) export-set)
          database (get idx db-ref)]
      (is (= 2 (count export-set)))
      (is (= :database (:type database)))
      (let [database-tables (set (for [schema (:schemas database)
                                       table (:tables schema)]
                                   [(:name schema) (:name table)]))]
        (is (= #{["PUBLIC" "USERS"]} database-tables))))))

(deftest export-import-singleton-test
  (testing "Testing export then import roundtrip"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card card {:type :question
                                       :dataset_query (lib/native-query mp "select 2")}]
        (doseq [query [(mt/native-query {:query "select 1"})
                       (mt/mbql-query users)
                       (lib/native-query (mt/metadata-provider) "select 1")
                       (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                       (lib/query mp (lib.metadata/card mp (:id card)))]]
          (mt/with-temp [:model/Card {qid :id} {:type :question
                                                :dataset_query query}]
            (let [question (t2/select-one :model/Card :id qid)
                  card-edn (export/export-entity question)
                  card-yaml (rep-yaml/generate-string card-edn)
                  card-rep (rep-yaml/parse-string card-yaml)
                  card-rep (rep-read/parse card-rep)

                  ;; Build ref-index with database
                  ref-index (v0-common/map-entity-index
                             {(v0-common/unref (:database card-edn))
                              (t2/select-one :model/Database (mt/id))

                              (v0-common/unref (v0-common/entity->ref card))
                              card})

                  question (import/insert! card-rep ref-index)]
              (try
                (let [edn (export/export-entity question)
                      yaml (rep-yaml/generate-string edn)
                      rep2 (rep-yaml/parse-string yaml)
                      rep2 (rep-read/parse rep2)]
                  (is (=? (dissoc card-rep :name :entity-id) rep2)))
                (finally
                  (t2/delete! :model/Card (:id question)))))))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Card :type :question)]
    (is (= :question (v0-common/representation-type entity)))))
