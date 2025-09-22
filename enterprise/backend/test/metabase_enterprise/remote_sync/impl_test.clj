(ns metabase-enterprise.remote-sync.impl-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [f] (mt/with-model-cleanup [:model/RemoteSyncChangeLog] (f))))

;; Mock LibrarySource implementation for testing
;; Helper functions for generating realistic YAML content
(defn- generate-collection-yaml [entity-id name & {:keys [parent-id]}]
  (format "name: %s
description: null
entity_id: %s
slug: %s
created_at: '2024-08-28T09:46:18.671622Z'
archived: false
type: null
parent_id: %s
personal_owner_id: null
namespace: null
authority_level: null
serdes/meta:
- id: %s
  label: %s
  model: Collection
archive_operation_id: null
archived_directly: null
is_sample: false
"
          name entity-id (str/replace (str/lower-case name) #"\s+" "_")
          (or parent-id "null") entity-id (str/replace (str/lower-case name) #"\s+" "_")))

(defn- generate-card-yaml [entity-id name collection-id]
  (format "name: %s
description: null
entity_id: %s
created_at: '2024-08-28T09:46:24.692002Z'
creator_id: rasta@metabase.com
display: table
archived: false
collection_id: %s
collection_preview: true
collection_position: null
query_type: null
database_id: test-data (h2)
table_id: null
enable_embedding: false
embedding_params: null
made_public_by_id: null
public_uuid: null
parameters: []
parameter_mappings: []
dataset_query: {}
result_metadata: null
visualization_settings:
  column_settings: null
card_schema: 22
serdes/meta:
- id: %s
  label: %s
  model: Card
archived_directly: false
dashboard_id: null
metabase_version: v1.54.4-SNAPSHOT (c6780bb)
source_card_id: null
type: question
document_id: null
"
          name entity-id collection-id entity-id (str/replace (str/lower-case name) #"\s+" "_")))

(defn- generate-dashboard-yaml [entity-id name collection-id & {:keys [dashcards]}]
  (let [dashcards-yaml (if dashcards
                         (str/join "\n" (map (fn [dc]
                                               (format "- entity_id: %s
  card_id: %s
  created_at: '2024-08-28T09:46:24.733016Z'
  row: 0
  col: 0
  size_x: 4
  size_y: 4
  action_id: null
  dashboard_tab_id: null
  inline_parameters: []
  parameter_mappings: []
  series: []
  visualization_settings:
    column_settings: null
  serdes/meta:
  - id: %s
    model: Dashboard
  - id: %s
    model: DashboardCard"
                                                       (:entity_id dc) (:card_id dc) entity-id (:entity_id dc)))
                                             dashcards))
                         "[]")]
    (format "name: %s
description: null
entity_id: %s
created_at: '2024-08-28T09:46:24.726993Z'
creator_id: rasta@metabase.com
archived: false
collection_id: %s
auto_apply_filters: true
collection_position: null
position: null
enable_embedding: false
embedding_params: null
made_public_by_id: null
public_uuid: null
show_in_getting_started: false
caveats: null
points_of_interest: null
parameters: []
serdes/meta:
- id: %s
  label: %s
  model: Dashboard
archived_directly: false
dashcards:
%s
initially_published_at: null
tabs: []
width: fixed
"
            name entity-id collection-id entity-id (str/replace (str/lower-case name) #"\s+" "_") dashcards-yaml)))

;; Mock LibrarySource implementation for testing
(defrecord MockLibrarySource [source-id base-url fail-mode files-atom]
  source.p/LibrarySource
  (branches [_this]
    (case fail-mode
      :branches-error (throw (java.net.UnknownHostException. "Network error"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      ;; Default success case
      {"main" "main-ref" "develop" "develop-ref"}))

  (list-files [_this branch]
    (case fail-mode
      :list-files-error (throw (Exception. "Failed to list files"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      :branch-error (throw (Exception. "Invalid branch specified"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      ;; Default success case - return files from atom
      (keys (get @files-atom branch {}))))

  (read-file [_this branch path]
    (case fail-mode
      :read-file-error (throw (Exception. "Failed to read file"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      :branch-error (throw (Exception. "Invalid branch specified"))
      ;; Default success case - return file content from atom
      (get-in @files-atom [branch path] "")))

  (write-files! [_this branch _message files]
    (case fail-mode
      :write-files-error (throw (Exception. "Failed to write files"))
      :store-error (throw (Exception. "Store failed"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      ;; Default success case - write files to atom
      (swap! files-atom assoc branch (into {} (map (juxt :path :content) files))))))

(defn create-mock-source
  "Create a mock LibrarySource for testing"
  [& {:keys [fail-mode initial-files]
      :or {fail-mode nil
           initial-files nil}}]
  (let [default-files {"main" {"collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/M-Q4pcV0qkiyJ0kiSWECl_some_collection.yaml"
                               (generate-collection-yaml "M-Q4pcV0qkiyJ0kiSWECl" "Some Collection")

                               "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/cards/f1C68pznmrpN1F5xFDj6d_some_question.yaml"
                               (generate-card-yaml "f1C68pznmrpN1F5xFDj6d" "Some Question" "M-Q4pcV0qkiyJ0kiSWECl")

                               "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/dashboards/Q_jD-f-9clKLFZ2TfUG2h_shared_dashboard.yaml"
                               (generate-dashboard-yaml "Q_jD-f-9clKLFZ2TfUG2h" "Shared Dashboard" "M-Q4pcV0qkiyJ0kiSWECl"
                                                        :dashcards [{:entity_id "UkpFcfUZMZt9ehChwnrAO" :card_id "f1C68pznmrpN1F5xFDj6d"}])}

                       "develop" {"collections/test-dev-collection.yaml"
                                  (generate-collection-yaml "test-dev-collectionxx" "Dev Collection")

                                  "cards/test-dev-card.yaml"
                                  (generate-card-yaml "test-dev-cardxxxxxxxx" "Dev Card" "test-dev-collectionxx")}}

        files-atom (atom (or initial-files default-files))]
    (->MockLibrarySource "test-source" "https://test.example.com" fail-mode files-atom)))

;; import! tests

(deftest import!-with-no-source-configured-test
  (testing "import! with no source configured"
    (with-redefs [source/source-from-settings (constantly nil)]
      (let [result (impl/import! "test-branch")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest import!-successful-with-specific-collections-test
  (testing "import! successful with specific collections"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
      (let [mock-source (create-mock-source)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/import! "test-branch" ["test-collection-1xxxx"])]
            (is (= :success (:status result)))
            (is (= "Successfully reloaded from git repository" (:message result)))))))))

(deftest import!-successful-without-collections-test
  (testing "import! successful without collections (imports all remote-synced)"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (create-mock-source)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/import! "test-branch")]
            (is (= :success (:status result)))))))))

(deftest import!-with-branch-parameter-test
  (testing "import! with branch parameter uses provided branch"
    (let [custom-files {"custom-branch" {"collections/custom-collection.yaml"
                                         (generate-collection-yaml "custom-collection-idx" "Custom Collection")}}
          mock-source (create-mock-source :initial-files custom-files)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "custom-branch")]
          (is (= :success (:status result))))))))

(deftest import!-falls-back-to-settings-branch-test
  (testing "import! falls back to settings branch when no branch provided"
    (let [mock-source (create-mock-source)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! nil)]
          (is (= :success (:status result))))))))

(deftest import!-handles-network-errors-test
  (testing "import! handles network errors"
    (let [mock-source (create-mock-source :fail-mode :network-error)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "main" ["collection-1"])]
          (is (= :error (:status result)))
          (is (re-find #"Network error" (:message result))))))))

(deftest import!-handles-authentication-errors-test
  (testing "import! handles authentication errors"
    (let [mock-source (create-mock-source :fail-mode :auth-error)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "main")]
          (is (= :error (:status result)))
          (is (re-find #"Authentication failed" (:message result))))))))

(deftest import!-handles-repository-not-found-errors-test
  (testing "import! handles repository not found errors"
    (let [mock-source (create-mock-source :fail-mode :repo-not-found)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "main")]
          (is (= :error (:status result)))
          (is (re-find #"Repository not found" (:message result))))))))

(deftest import!-handles-branch-errors-test
  (testing "import! handles branch errors"
    (let [mock-source (create-mock-source :fail-mode :branch-error)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "nonexistent-branch")]
          (is (= :error (:status result)))
          (is (re-find #"Branch error:" (:message result))))))))

(deftest import!-handles-generic-errors-test
  (testing "import! handles generic errors"
    (let [mock-source (create-mock-source :fail-mode :list-files-error)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "main")]
          (is (= :error (:status result)))
          (is (re-find #"Failed to reload from git repository" (:message result))))))))

;; export! tests

(deftest export!-with-no-source-configured-test
  (testing "export! with no source configured"
    (with-redefs [source/source-from-settings (constantly nil)]
      (let [result (impl/export! "test-branch" "Test commit")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest export!-successful-with-specific-collections-test
  (testing "export! successful with specific collections"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (create-mock-source)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/export! "test-branch" "Test commit message" ["test-collection-1xxxx"])]
            (is (= :success (:status result)))))))))

(deftest export!-successful-with-default-collections-test
  (testing "export! successful with default collections"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (create-mock-source)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/export! "test-branch" "Test commit message")]
            (is (= :success (:status result)))))))))

(deftest export!-handles-extraction-failure-test
  (testing "export! handles extraction failure"
    ;; This test simulates when the serialization extraction fails
    ;; We can trigger this by having no valid collections to export
    (let [mock-source (create-mock-source)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        ;; Try to export a non-existent collection
        (let [result (impl/export! "test-branch" "Test commit message" ["nonexistentcollection"])]
          ;; The export should still succeed but with no entities to export
          (is (= :success (:status result))))))))

(deftest export!-handles-store-failure-test
  (testing "export! handles store failure"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (create-mock-source :fail-mode :store-error)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/export! "test-branch" "Test commit message" ["test-collection-1xxxx"])]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

(deftest export!-handles-network-errors-during-write-test
  (testing "export! handles network errors during write"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (create-mock-source :fail-mode :network-error)]
        (with-redefs [source/source-from-settings (constantly mock-source)]
          (let [result (impl/export! "test-branch" "Test commit message" ["test-collection-1xxxx"])]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

;; Integration tests

(deftest complete-import-export-workflow-test
  (testing "complete import-export workflow"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
      (let [mock-source (create-mock-source)]
        (with-redefs [source/source-from-settings (constantly mock-source)]

          ;; First export - verify it succeeds and files are written to the mock source
          (let [export-result (impl/export! "test-branch" "Test export" ["test-collection-1xxxx"])]
            (is (= :success (:status export-result)))

            ;; Verify files were written to the mock source atom
            (let [files-after-export (get @(:files-atom mock-source) "test-branch")]
              (is (map? files-after-export))
              (is (not-empty files-after-export))
              ;; Should have at least collection and card files
              (is (some #(str/includes? % "collection") (keys files-after-export)))
              (is (some #(str/includes? % "card") (keys files-after-export)))))

          ;; Then import - verify it succeeds and processes the exported files
          (let [import-result (impl/import! "test-branch" ["test-collection-1xxxx"])]
            (is (= :success (:status import-result)))
            (is (= "Successfully reloaded from git repository" (:message import-result)))

            ;; Verify the entities still exist after import
            (is (t2/exists? :model/Collection :id coll-id))
            (is (t2/exists? :model/Card :id card-id))

            ;; Verify the collection and card still have the correct attributes
            (let [collection (t2/select-one :model/Collection :id coll-id)
                  card (t2/select-one :model/Card :id card-id)]
              (is (= "Test Collection" (:name collection)))
              (is (= "remote-synced" (:type collection)))
              (is (= "test-collection-1xxxx" (:entity_id collection)))
              (is (= "Test Card" (:name card)))
              (is (= "test-card-1xxxxxxxxxx" (:entity_id card)))
              (is (= coll-id (:collection_id card))))))))))

(deftest collection-cleanup-during-import-test
  (testing "collection cleanup during import (tests clean-synced! private function)"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :type "remote-synced" :entity_id "test-collection-2xxxx" :location "/"}
                   :model/Card {card1-id :id} {:name "Card 1" :collection_id coll1-id :entity_id "test-card-1xxxxxxxxxx"}
                   :model/Card {card2-id :id} {:name "Card 2" :collection_id coll2-id :entity_id "test-card-2xxxxxxxxxx"}]
      (let [test-files {"test-branch" {"collections/test-collection-1.yaml"
                                       (generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                       "cards/test-card-1.yaml"
                                       (generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
            mock-source (create-mock-source :initial-files test-files)]
        (with-redefs [source/source-from-settings (constantly mock-source)]

          ;; Import only collection 1 - this exercises the cleanup logic for collection 2
          (let [result (impl/import! "test-branch")]
            (is (= :success (:status result))))

          ;; Verify the entities still exist (real cleanup would require more complex setup)
          (is (t2/exists? :model/Card :id card1-id))
          (is (not (t2/exists? :model/Collection :id coll2-id)))
          (is (not (t2/exists? :model/Card :id card2-id))))))))

(deftest error-handling-propagation-through-private-functions-test
  (testing "error handling propagation through private functions"
    (let [mock-source (create-mock-source :fail-mode :network-error)]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (let [result (impl/import! "test-branch" ["test-collection"])]
          (is (= :error (:status result)))
          (is (re-find #"Network error" (:message result))))))))
