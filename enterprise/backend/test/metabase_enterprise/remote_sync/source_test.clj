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

  (apply-changes! [_ message upserts _delete-paths]
    (reset! written-files {:message message :files (vec upserts)})
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
    (->MockSourceSnapshot written-files))

  (snapshot-at [_ _version]
    (->MockSourceSnapshot written-files)))

(defn- create-test-entity
  "Creates a test entity with serdes/meta for testing"
  [id label model-name]
  {:serdes/meta [{:id id :label label :model model-name}]
   :name (str "Test " label)
   :entity_id id})

(defn- create-test-entity*
  "Like create-test-entity but with an extra field to vary the serialized content (simulating an edit)."
  [id label model-name extra]
  (assoc (create-test-entity id label model-name) :note extra))

(defn- entities->snapshot
  "Serializes `entities` to file specs and returns a snapshot whose list-files/read-file expose them. The
  snapshot also records writes into `written` (an atom) and reports a fixed version, so it can stand in for
  the remote tip in [[source/merge-and-store!]]."
  [entities task-id written]
  (let [by-path (into {} (map (juxt :path :content)) (source/serialize-specs entities task-id))]
    (reify source.p/SourceSnapshot
      (list-files [_] (vec (keys by-path)))
      (read-file [_ p] (get by-path p))
      (write-files! [_ message files]
        (reset! written {:message message :files (vec files)})
        "merged-version")
      (apply-changes! [_ message upserts _delete-paths]
        (reset! written {:message message :files (vec upserts)})
        "merged-version")
      (version [_] "remote-tip"))))

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
        (is (= "mock-written-version" (:version (source/store! test-entities (source.p/snapshot mock-source) task-id "Test commit message"))))
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
        (source/store! test-entities (source.p/snapshot mock-source) task-id "Test commit")
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
        (source/store! [] (source.p/snapshot mock-source) task-id "Empty commit")
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
        (source/store! [test-entity] (source.p/snapshot mock-source-1) task-id "First commit")
        (source/store! [test-entity] (source.p/snapshot mock-source-2) task-id "Second commit")
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

(deftest merge-and-store!-clean-merge-test
  (testing "when local and remote changed different entities, merge-and-store! writes the union with no conflict"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [written     (atom nil)
            base        [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")]
            ;; local kept A and B, added C
            ours        [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")
                         (create-test-entity "C" "c" "Card")]
            ;; remote kept A and B, added D
            theirs      [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")
                         (create-test-entity "D" "d" "Card")]
            base-snap   (entities->snapshot base task-id (atom nil))
            remote-snap (entities->snapshot theirs task-id written)
            result      (source/merge-and-store! ours remote-snap base-snap task-id "merge commit")]
        (is (= :success (:status result)))
        (is (= "merged-version" (:version result)))
        (is (= {:added 1 :updated 0 :removed 0} (:summary result))
            "only D is folded in from the remote")
        (testing "the union of all four entities is written"
          (let [ids (->> @written :files
                         (keep #(second (re-find #"entity_id: (\w+)" (:content %))))
                         sort)]
            (is (= ["A" "B" "C" "D"] ids))))))))

(deftest merge-and-store!-conflict-test
  (testing "when the same entity changed on both sides, merge-and-store! returns :conflict and writes nothing"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [written     (atom nil)
            base        [(create-test-entity "A" "a" "Card")]
            ours        [(create-test-entity* "A" "a" "Card" "ours")]
            theirs      [(create-test-entity* "A" "a" "Card" "theirs")]
            base-snap   (entities->snapshot base task-id (atom nil))
            remote-snap (entities->snapshot theirs task-id written)
            result      (source/merge-and-store! ours remote-snap base-snap task-id "merge commit")]
        (is (= :conflict (:status result)))
        (is (= 1 (count (:conflicts result))))
        (is (nil? @written) "nothing should be written when there is a conflict")))))

(deftest preview-merge-clean-test
  (testing "preview-merge reports a clean merge and summary without writing"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [written     (atom nil)
            base        [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")]
            ours        [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")
                         (create-test-entity "C" "c" "Card")]
            theirs      [(create-test-entity "A" "a" "Card") (create-test-entity "B" "b" "Card")
                         (create-test-entity "D" "d" "Card")]
            base-snap   (entities->snapshot base task-id (atom nil))
            remote-snap (entities->snapshot theirs task-id written)
            result      (source/preview-merge ours remote-snap base-snap nil)]
        (is (true? (:clean? result)))
        (is (empty? (:conflicts result)))
        (is (= {:added 1 :updated 0 :removed 0} (:summary result)))
        (is (nil? @written) "preview must not write")))))

(deftest preview-merge-conflict-test
  (testing "preview-merge reports conflicts (with labels) without writing"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [written     (atom nil)
            base        [(create-test-entity "A" "a" "Card")]
            ours        [(create-test-entity* "A" "a" "Card" "ours")]
            theirs      [(create-test-entity* "A" "a" "Card" "theirs")]
            base-snap   (entities->snapshot base task-id (atom nil))
            remote-snap (entities->snapshot theirs task-id written)
            result      (source/preview-merge ours remote-snap base-snap nil)]
        (is (false? (:clean? result)))
        (is (= 1 (count (:conflicts result))))
        (is (every? string? (:conflicts result)))
        (is (nil? @written))))))
