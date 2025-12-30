(ns metabase-enterprise.remote-sync.source-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each th/clean-remote-sync-state)

(defrecord MockSourceSnapshot [written-files]
  source.p/SourceSnapshot
  (list-files [_]
    [])

  (read-file [_ _path]
    nil)

  (write-files! [_ message files]
    (let [realized-files (vec files)]
      (reset! written-files {:message message :files realized-files}))
    "mock-written-version")

  (version [_]
    "mock-version"))

(defrecord MockSource [written-files]
  source.p/Source
  (create-branch [_ _branch _base]
    nil)

  (branches [_]
    ["main"])

  (default-branch [_]
    "main")

  (snapshot [_]
    (->MockSourceSnapshot written-files)))

(defn- create-test-entity
  "Creates a test entity with serdes/meta for testing"
  [id label model-name]
  {:serdes/meta [{:id id :label label :model model-name}]
   :name (str "Test " label)
   :entity_id id})

(deftest store!-basic-test
  (testing "store! writes files to source with correct structure"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test2@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)
            test-entities [(create-test-entity "test-id-1" "entity-one" "Collection")
                           (create-test-entity "test-id-2" "entity-two" "Card")]]

        (is (= "mock-written-version" (source/store! test-entities [] (source.p/snapshot mock-source) task-id "Test commit message")))

        (testing "write-files! was called with correct message"
          (is (= "Test commit message" (:message @written-files))))

        (testing "write-files! was called with correct number of files"
          (is (= 2 (count (:files @written-files)))))

        (testing "each file has path and content"
          (doseq [file (:files @written-files)]
            (is (contains? file :path) "File should have :path")
            (is (contains? file :content) "File should have :content")
            (is (string? (:path file)) "Path should be a string")
            (is (string? (:content file)) "Content should be a string")))

        (testing "file paths end with .yaml"
          (doseq [file (:files @written-files)]
            (is (str/ends-with? (:path file) ".yaml")
                "File paths should end with .yaml")))

        (testing "file content is valid YAML containing entity data"
          (doseq [file (:files @written-files)]
            (is (str/includes? (:content file) "serdes/meta")
                "Content should include serdes/meta")
            (is (or (str/includes? (:content file) "test-id-1")
                    (str/includes? (:content file) "test-id-2"))
                "Content should include entity ID")))))))

(deftest store!-progress-tracking-test
  (testing "store! updates task progress as files are written"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test2@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)
            test-entities [(create-test-entity "test-id-1" "entity-one" "Collection")
                           (create-test-entity "test-id-2" "entity-two" "Card")
                           (create-test-entity "test-id-3" "entity-three" "Dashboard")]]

        (let [initial-task (t2/select-one :model/RemoteSyncTask :id task-id)]
          (is (nil? (:progress initial-task)) "Progress should be nil initially"))

        (source/store! test-entities [] (source.p/snapshot mock-source) task-id "Test commit")

        (let [final-task (t2/select-one :model/RemoteSyncTask :id task-id)]
          (is (some? (:progress final-task)) "Progress should be updated after store!")
          (is (> (:progress final-task) 0.3) "Progress should be greater than 0.3")
          (is (<= (:progress final-task) 0.95) "Progress should be at most 0.95")
          (is (some? (:last_progress_report_at final-task))
              "last_progress_report_at should be set"))))))

(deftest store!-empty-stream-test
  (testing "store! handles empty stream correctly"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test2@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)]

        (source/store! [] [] (source.p/snapshot mock-source) task-id "Empty commit")

        (testing "write-files! was called even with empty stream"
          (is (some? @written-files)))

        (testing "files list is empty"
          (is (empty? (:files @written-files))))))))

(deftest store!-deterministic-yaml-test
  (testing "store! produces deterministic YAML output with consistent key ordering"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test2@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files-1 (atom nil)
            written-files-2 (atom nil)
            mock-source-1 (->MockSource written-files-1)
            mock-source-2 (->MockSource written-files-2)
            ;; Create entity with keys in non-alphabetical order to test sorting
            test-entity {:serdes/meta [{:id "test-id" :label "test-entity" :model "Card"}]
                         :z_last_field "should be last (unknown)"
                         :a_first_field "should be after known fields (unknown)"
                         :name "Test Card"
                         :description "A test card"
                         :entity_id "test-id"
                         :display "table"
                         :dataset_query {:z_field 1 :a_field 2 :database 3}
                         :visualization_settings {:zebra true :apple false}}]
        ;; Store the same entity twice
        (source/store! [test-entity] [] (source.p/snapshot mock-source-1) task-id "First commit")
        (source/store! [test-entity] [] (source.p/snapshot mock-source-2) task-id "Second commit")
        (testing "YAML content is identical between runs"
          (let [content-1 (-> @written-files-1 :files first :content)
                content-2 (-> @written-files-2 :files first :content)]
            (is (= content-1 content-2)
                "YAML content should be identical for the same entity")))
        (testing "known keys appear in serialization-order.edn order"
          (let [content (-> @written-files-1 :files first :content)
                name-pos (str/index-of content "name:")
                description-pos (str/index-of content "description:")
                display-pos (str/index-of content "display:")]
            ;; Per serialization-order.edn, Card order is: name, description, entity_id, ... display
            (is (< name-pos description-pos)
                "name should appear before description")
            (is (< description-pos display-pos)
                "description should appear before display")))
        (testing "unknown keys are sorted alphabetically after known keys"
          (let [content (-> @written-files-1 :files first :content)
                a-first-pos (str/index-of content "a_first_field:")
                z-last-pos (str/index-of content "z_last_field:")]
            (is (< a-first-pos z-last-pos)
                "a_first_field should appear before z_last_field (alphabetical)")))))))
