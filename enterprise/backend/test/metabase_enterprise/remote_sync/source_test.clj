(ns metabase-enterprise.remote-sync.source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each th/clean-remote-sync-state)

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
      (open-commit [_]
        (let [staged (atom [])]
          (reify source.p/CommitBuilder
            (stage-upsert! [_ spec] (swap! staged conj spec) nil)
            (stage-delete! [_ _path] nil)
            (replace-all! [_] nil)
            (finish-commit! [_ message]
              (reset! written {:message message :files @staged})
              "merged-version")
            (abort-commit! [_] nil))))
      (version [_] "remote-tip"))))

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
