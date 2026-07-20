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
  the remote tip in the merge tests."
  [entities task-id written]
  (let [by-path (into {} (map (juxt :path :content)) (source/serialize-specs entities task-id))]
    (reify source.p/SourceSnapshot
      (list-files [_] (vec (keys by-path)))
      (list-dir [_ p] (source/paths->child-names (keys by-path) p))
      (read-file [_ p] (get by-path p))
      (open-commit [_]
        (let [staged (atom [])]
          (reify source.p/CommitBuilder
            (stage-upsert! [_ spec] (swap! staged conj spec) nil)
            (stage-delete! [_ _path] nil)
            (replace-all! [_] nil)
            (empty-commit? [_] false)
            (finish-commit! [_ message]
              (reset! written {:message message :files @staged})
              "merged-version")
            (finish-commit! [_ message report-progress]
              (reset! written {:message message :files @staged})
              (when report-progress (report-progress 0.8))
              "merged-version")
            (abort-commit! [_] nil))))
      (version [_] "remote-tip"))))

(deftest paths->child-names-test
  (testing "the flat-path stand-in matches the contract git's list-dir implements"
    (let [paths ["root.txt"
                 "data_apps/README.md"
                 "data_apps/beta/data_app.yaml"
                 "data_apps/alpha/data_app.yaml"
                 "data_apps/alpha/deep/nested.js"]]
      (testing "immediate children only, sorted, deduped"
        (is (= ["README.md" "alpha" "beta"] (source/paths->child-names paths "data_apps")))
        (is (= ["data_app.yaml" "deep"] (source/paths->child-names paths "data_apps/alpha"))))
      (testing "the repo root — paths are repo-relative, so the root prefix is empty, not \"/\""
        (is (= ["data_apps" "root.txt"] (source/paths->child-names paths ""))))
      (testing "a file, or an absent directory, has no children"
        (is (= [] (source/paths->child-names paths "root.txt")))
        (is (= [] (source/paths->child-names paths "nope"))))
      (testing "sorting is by child name — a sibling sorting before the directory's separator can't reorder it"
        ;; \- sorts before \/, so sorting the raw paths would yield ("a-b" "a") here
        (is (= ["a" "a-b"] (source/paths->child-names ["d/a-b" "d/a/x"] "d")))))))

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
