(ns metabase-enterprise.representations.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.model]
   [metabase-enterprise.representations.v0.question]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest check-its-running
  (is true))

(deftest export-import-test
  (testing "Export database and question with refs, then import in order"
    (mt/with-temp [:model/Database database {:name "Test Database for Refs"
                                             :engine :h2
                                             :details {}}]
      (let [db-id     (:id database)
            db-export (rep/export database)
            db-ref    (:name db-export)]
        (mt/with-temp [:model/Card question {:name          "Test Question with Ref"
                                             :type          :question
                                             :database_id   db-id
                                             :dataset_query {:database db-id
                                                             :type :native
                                                             :native {:query "SELECT 1"}}}]
          (let [question-export (rep/export question)]
            (is (= (str "ref:database-" db-id) (:database question-export))
                "Question export should reference database with ref")
            (is (= db-ref (str "database-" db-id))
                "Database export should have correct ref")
            (let [db-yaml (rep-yaml/generate-string db-export)
                  question-yaml (rep-yaml/generate-string question-export)
                  db-rep (rep-yaml/parse-string db-yaml)
                  question-rep (rep-yaml/parse-string question-yaml)]
              (is (rep-read/parse db-rep)
                  "Database representation should validate")
              (is (rep-read/parse question-rep)
                  "Question representation should validate")
              (let [ref-index (v0-common/map-entity-index {db-ref database})
                    persisted-question (rep/insert! question-rep ref-index)]
                (try
                  (is persisted-question "Question should persist successfully")
                  (is (= (:id database) (:database_id persisted-question))
                      "Imported question should reference imported database")
                  (let [re-exported (rep/export persisted-question)
                        re-exported-yaml (rep-yaml/generate-string re-exported)
                        re-exported-rep (rep-yaml/parse-string re-exported-yaml)]
                    (is (=? (dissoc question-rep :name :entity-id) re-exported-rep)
                        "Re-exported representation should match original"))
                  (finally
                    (t2/delete! :model/Card (:id persisted-question))))))))))))
