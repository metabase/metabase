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

(defrecord MockSource [written-files]
  source.p/LibrarySource
  (create-branch [_ _branch _base]
    nil)

  (branches [_]
    ["main"])

  (list-files [_]
    [])

  (read-file [_ _path]
    nil)

  (write-files! [_ message files]
    (let [realized-files (vec files)]
      (reset! written-files {:message message :files realized-files}))))

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
                                     :email "test@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)
            test-entities [(create-test-entity "test-id-1" "entity-one" "Collection")
                           (create-test-entity "test-id-2" "entity-two" "Card")]]

        (source/store! test-entities mock-source task-id "Test commit message")

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
                                     :email "test@example.com"
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

        (source/store! test-entities mock-source task-id "Test commit")

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
                                     :email "test@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)]

        (source/store! [] mock-source task-id "Empty commit")

        (testing "write-files! was called even with empty stream"
          (is (some? @written-files)))

        (testing "files list is empty"
          (is (empty? (:files @written-files))))))))

(deftest store!-large-stream-test
  (testing "store! handles many entities efficiently"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"
                                     :password "password123"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export"
                                                        :initiated_by (:id user)}]
      (let [written-files (atom nil)
            mock-source (->MockSource written-files)
            test-entities (map #(create-test-entity (str "test-id-" %)
                                                    (str "entity-" %)
                                                    "Collection")
                               (range 10))]

        (source/store! test-entities mock-source task-id "Bulk commit")

        (testing "all entities were written"
          (is (= 10 (count (:files @written-files)))))

        (testing "progress was updated"
          (let [final-task (t2/select-one :model/RemoteSyncTask :id task-id)]
            (is (some? (:progress final-task)))))))))
