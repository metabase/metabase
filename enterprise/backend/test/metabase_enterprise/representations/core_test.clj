(ns metabase-enterprise.representations.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.representations.core :as rep]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]))

(use-fixtures :once (fixtures/initialize :db))

(deftest check-its-running
  (is true))

(deftest export-import-with-refs-test
  (testing "Export database and question with refs, then import in order"
    (mt/with-temp [:model/Database database {:name    "Test Database for Refs"
                                             :engine  :h2
                                             :details {}}]
      (let [db-id     (:id database)
            db-export (rep/export-with-refs database)
            db-ref    (:ref db-export)]

        (mt/with-temp [:model/Card question {:name          "Test Question with Ref"
                                             :type          :question
                                             :database_id   db-id
                                             :dataset_query {:database db-id
                                                             :type     :native
                                                             :native   {:query "SELECT 1"}}}]
          (let [question-export (rep/export-with-refs question)]
            (is (= (str "ref:database-" db-id) (:database question-export))
                "Question export should reference database with ref")
            (is (= db-ref (str "database-" db-id))
                "Database export should have correct ref")
            (let [db-yaml       (yaml/generate-string db-export)
                  question-yaml (yaml/generate-string question-export)
                  db-rep        (yaml/parse-string db-yaml)
                  question-rep  (yaml/parse-string question-yaml)]
              (is (rep/normalize-representation db-rep)
                  "Database representation should validate")
              (is (rep/normalize-representation question-rep)
                  "Question representation should validate")
              (let [persisted-db       (rep/persist! db-rep nil)
                    ref-index          {db-ref persisted-db}
                    persisted-question (rep/persist! question-rep ref-index)]
                (is persisted-db "Database should persist successfully")
                (is persisted-question "Question should persist successfully")
                (is (= (:id persisted-db) (:database_id persisted-question))
                    "Imported question should reference imported database")
                (let [re-exported      (rep/export-with-refs persisted-question)
                      re-exported-yaml (yaml/generate-string re-exported)
                      re-exported-rep  (yaml/parse-string re-exported-yaml)]
                  (is (=? (dissoc question-rep :ref) re-exported-rep)
                      "Re-exported representation should match original"))))))))))

