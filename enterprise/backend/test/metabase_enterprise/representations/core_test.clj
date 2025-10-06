(ns metabase-enterprise.representations.core-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.model]
   [metabase-enterprise.representations.v0.question]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest check-its-running
  (is true))

(deftest export-import-with-refs-test
  (testing "Export database and question with refs, then import in order"
    (mt/with-temp [:model/Database database {:name "Test Database for Refs"
                                             :engine :h2
                                             :details {}}]
      (let [db-id (:id database)
            db-export (rep/export-with-refs database)
            db-ref (:ref db-export)]

        (mt/with-temp [:model/Card question {:name "Test Question with Ref"
                                             :type :question
                                             :database_id db-id
                                             :dataset_query {:database db-id
                                                             :type :native
                                                             :native {:query "SELECT 1"}}}]
          (let [question-export (rep/export-with-refs question)]
            (is (= (str "ref:database-" db-id) (:database question-export))
                "Question export should reference database with ref")
            (is (= db-ref (str "database-" db-id))
                "Database export should have correct ref")
            (let [db-yaml (yaml/generate-string db-export)
                  question-yaml (yaml/generate-string question-export)
                  db-rep (yaml/parse-string db-yaml)
                  question-rep (yaml/parse-string question-yaml)]
              (is (rep/normalize-representation db-rep)
                  "Database representation should validate")
              (is (rep/normalize-representation question-rep)
                  "Question representation should validate")
              (let [persisted-db (rep/persist! db-rep nil)
                    ref-index {db-ref persisted-db}
                    persisted-question (rep/persist! question-rep ref-index)]
                (is persisted-db "Database should persist successfully")
                (is persisted-question "Question should persist successfully")
                (is (= (:id persisted-db) (:database_id persisted-question))
                    "Imported question should reference imported database")
                (let [re-exported (rep/export-with-refs persisted-question)
                      re-exported-yaml (yaml/generate-string re-exported)
                      re-exported-rep (yaml/parse-string re-exported-yaml)]
                  (is (=? (dissoc question-rep :ref) re-exported-rep)
                      "Re-exported representation should match original"))))))))))

(deftest mbql-question-roundtrip-test
  (testing "Export and import MBQL-based question with separate MBQL data"
    (mt/with-temp [:model/Card question {:name "MBQL Question Test"
                                         :type :question
                                         :database_id (mt/id)
                                         :dataset_query (mt/mbql-query users {:limit 10})}]
      (let [card-export (rep/export-with-refs question)
            card-yaml (yaml/generate-string card-export)
            card-rep (yaml/parse-string card-yaml)]

        (is (rep/normalize-representation card-rep)
            "MBQL question export should validate")

        (is (string? (:mbql_query card-rep))
            "Export should have mbql_query as ref string")

        (let [mbql-export (export/export-mbql-data question)
              mbql-yaml (-> mbql-export export/export-entity yaml/generate-string)
              mbql-rep (yaml/parse-string mbql-yaml)

              db (mt/db)
              db-ref (str "database-" (mt/id))
              mbql-ref (:ref mbql-rep)

              mbql-data (rep/persist! mbql-rep nil)
              ref-index {db-ref db
                         mbql-ref mbql-data}

              persisted (rep/persist! card-rep ref-index)]

          (is mbql-data "MBQL data should persist to ref-index")
          (is persisted "MBQL question should persist successfully")

          (let [re-exported-card (rep/export-with-refs persisted)
                re-exported-card-yaml (yaml/generate-string re-exported-card)
                re-exported-card-rep (yaml/parse-string re-exported-card-yaml)]

            (is (=? (dissoc card-rep :ref) (dissoc re-exported-card-rep :ref))
                "Re-exported MBQL question should match original")))))))

(deftest mbql-model-roundtrip-test
  (testing "Export and import MBQL-based model with separate MBQL data and result_metadata"
    (mt/with-temp [:model/Card model {:name "MBQL Model Test"
                                      :type :model
                                      :database_id (mt/id)
                                      :dataset_query (mt/mbql-query users {:limit 5})
                                      :result_metadata [{:name "ID"
                                                         :display_name "ID"
                                                         :base_type :type/Integer}
                                                        {:name "NAME"
                                                         :display_name "Name"
                                                         :base_type :type/Text}]}]
      (let [card-export (rep/export-with-refs model)
            card-yaml (yaml/generate-string card-export)
            card-rep (yaml/parse-string card-yaml)]

        (is (rep/normalize-representation card-rep)
            "MBQL model export should validate")

        (is (string? (:mbql_query card-rep))
            "Export should have mbql_query as ref string")

        (let [mbql-export (export/export-mbql-data model)
              mbql-yaml (-> mbql-export export/export-entity yaml/generate-string)
              mbql-rep (yaml/parse-string mbql-yaml)

              db (mt/db)
              db-ref (str "database-" (mt/id))
              mbql-ref (:ref mbql-rep)

              mbql-data (rep/persist! mbql-rep nil)
              ref-index {db-ref db
                         mbql-ref mbql-data}

              persisted (rep/persist! card-rep ref-index)]

          (is mbql-data "MBQL data should persist to ref-index")
          (is (:result_metadata mbql-data) "MBQL data should contain result_metadata")
          (is persisted "MBQL model should persist successfully")

          (let [re-exported-card (rep/export-with-refs persisted)
                re-exported-card-yaml (yaml/generate-string re-exported-card)
                re-exported-card-rep (yaml/parse-string re-exported-card-yaml)]

            (is (=? (-> card-rep (dissoc :ref :mbql_query))
                    (-> re-exported-card-rep (dissoc :ref :mbql_query)))
                "Re-exported MBQL model should match original (excluding refs)")
            (is (string? (:mbql_query re-exported-card-rep))
                "Re-exported model should still have MBQL ref")))))))

(deftest collection-export-with-mbql-files-test
  (testing "Collection export creates separate .mbql.yml files for MBQL cards"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}]
      (let [coll-id (:id collection)]
        (mt/with-temp [:model/Card _question {:name "MBQL Question"
                                              :type :question
                                              :database_id (mt/id)
                                              :collection_id coll-id
                                              :dataset_query (mt/mbql-query venues {:limit 10})}
                       :model/Card _model {:name "MBQL Model"
                                           :type :model
                                           :database_id (mt/id)
                                           :collection_id coll-id
                                           :dataset_query (mt/mbql-query users {:limit 5})}
                       :model/Card _native-q {:name "Native Question"
                                              :type :question
                                              :database_id (mt/id)
                                              :collection_id coll-id
                                              :dataset_query {:database (mt/id)
                                                              :type :native
                                                              :native {:query "SELECT 1"}}}]
          ;; Export the collection with user context
          (mt/with-test-user :rasta
            (let [export-dir (str "test_resources/representations/v0/test-export-" (random-uuid) "/")
                  _ (rep/export-collection-representations coll-id export-dir)
                  coll-dir (str export-dir (v0-common/file-sys-name coll-id (:name collection) "/"))
                  files (-> (io/file coll-dir)
                            .listFiles
                            seq
                            (->> (map #(.getName ^java.io.File %)))
                            set)
                  yaml-files (filter #(re-matches #".*\.yml" %) files)
                  mbql-files (filter #(re-matches #".*\.mbql\.yml" %) files)
                  db-files (filter #(re-matches #".*\.database\.yml" %) files)]
              (testing "Correct number of each file type"
                (is (= 6 (count yaml-files))
                    "Should have 6 YAML files (1 database, 3 cards, 2 MBQL files)")
                (is (= 2 (count mbql-files))
                    "Should have 2 MBQL files (question + model, not native)")
                (is (= 1 (count db-files))
                    "Should have 1 database file"))
              ;; Cleanup - recursively delete directory
              (letfn [(delete-dir [^java.io.File file]
                        (when (.isDirectory file)
                          (doseq [child (.listFiles file)]
                            (delete-dir child)))
                        (.delete file))]
                (delete-dir (io/file export-dir))))))))))
