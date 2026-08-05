(ns metabase-enterprise.remote-sync.worktree-test
  "Tests for remote-sync worktrees: the admin-only worktree API, the entity_id remapping serdes resolves through,
  and what deleting a worktree takes with it. The rules that pin a piece of content to one worktree are tested
  alongside the models they guard."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------- API -------------------------------------------------

(deftest worktree-crud-is-admin-only-test
  (testing "worktrees are superuser-only"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temp [:model/Worktree {wt-id :id} {}]
        (testing "a non-admin sees no worktrees at all"
          (is (= [] (mt/user-http-request :rasta :get 200 "ee/remote-sync/worktree"))))
        (testing "and cannot read, create or delete one"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "ee/remote-sync/worktree/" wt-id))))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/remote-sync/worktree" {:branch "nope"})))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (str "ee/remote-sync/worktree/" wt-id)))))))))

(deftest worktree-create-and-list-test
  (testing "an admin can create a worktree and read it back"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-model-cleanup [:model/Worktree]
        (let [branch  (:branch (mt/with-temp-defaults :model/Worktree))
              created (mt/user-http-request :crowberto :post 200 "ee/remote-sync/worktree" {:branch branch})]
          (is (=? {:branch branch :creator_id (mt/user->id :crowberto)} created))
          (is (=? {:branch branch}
                  (mt/user-http-request :crowberto :get 200 (str "ee/remote-sync/worktree/" (:id created)))))
          (is (contains? (into #{} (map :branch) (mt/user-http-request :crowberto :get 200 "ee/remote-sync/worktree"))
                         branch))
          (testing "a branch can only be checked out once"
            (is (= (format "A worktree for branch '%s' already exists." branch)
                   (mt/user-http-request :crowberto :post 400 "ee/remote-sync/worktree" {:branch branch})))))))))

(deftest worktree-404s-test
  (testing "an unknown worktree 404s rather than silently falling back to the main app"
    (mt/with-premium-features #{:remote-sync}
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "ee/remote-sync/worktree/99999999")))
      (is (= "Not found."
             (mt/user-http-request :crowberto :delete 404 "ee/remote-sync/worktree/99999999")))
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "ee/remote-sync/is-dirty" :worktree-id 99999999))))))

;;; ------------------------------------------- entity_id remapping -------------------------------------------

(def ^:private branch-eid "branch-side-entity-id")
(def ^:private local-eid "worktree-local-entity")
(def ^:private fresh-eid "created-in-a-worktree")

(deftest entity-id-remapping-test
  (mt/with-temp [:model/Worktree {wt-id :id} {}]
    (testing "outside a worktree ids pass through untouched"
      (is (= branch-eid (serdes/local-entity-id "Transform" branch-eid)))
      (is (= branch-eid (serdes/source-entity-id "Transform" branch-eid))))
    (binding [serdes/*worktree-id* wt-id]
      (testing "an id the worktree has not checked out has no local row"
        (is (nil? (serdes/local-entity-id "Transform" branch-eid))))
      (testing "a recorded pair resolves in both directions, and only for its own model"
        (is (= branch-eid (serdes/ensure-remapping! "Transform" local-eid branch-eid)))
        (is (= local-eid (serdes/local-entity-id "Transform" branch-eid)))
        (is (= branch-eid (serdes/source-entity-id "Transform" local-eid)))
        (is (nil? (serdes/local-entity-id "TransformTag" branch-eid))))
      (testing "ensure-remapping! is idempotent"
        (is (= branch-eid (serdes/ensure-remapping! "Transform" local-eid)))
        (is (= 1 (t2/count :model/WorktreeRemapping :worktree_id wt-id))))
      (testing "content created inside the worktree gets a branch id of its own"
        (let [source (serdes/ensure-remapping! "Transform" fresh-eid)]
          (is (some? source))
          (is (not= fresh-eid source))))
      (testing "batch resolution passes ids the worktree hasn't checked out through unchanged"
        (is (= #{local-eid "not-checked-out-in-wt"}
               (serdes/local-entity-ids "Transform" [branch-eid "not-checked-out-in-wt"])))))))

(deftest worktree-scoped-models-test
  (testing "only transform content and collections are checked out into a worktree"
    (is (every? serdes/worktree-scoped? ["Collection" "Transform" "TransformTag" "TransformTransformTag"]))
    (testing "everything else is skipped by a worktree pull rather than written to the main app"
      (is (not-any? serdes/worktree-scoped? ["Card" "Dashboard" "NativeQuerySnippet" "PythonLibrary" "Action"])))))

;;; ---------------------------------------------- Deletion ----------------------------------------------

(deftest delete-worktree-drops-its-content-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/Worktree {wt-id :id} {}
                   :model/Worktree {other-id :id} {}
                   :model/Transform {tf-id :id} {:name "worktree transform" :worktree_id wt-id}
                   :model/Transform {other-tf :id} {:name "other transform" :worktree_id other-id}
                   :model/Transform {main-tf :id} {:name "main transform"}
                   :model/TransformTag {tag-id :id} {:name "worktree tag" :worktree_id wt-id}
                   :model/Collection {coll-id :id} {:name "worktree collection" :worktree_id wt-id}]
      (t2/insert! :model/WorktreeRemapping {:worktree_id      wt-id
                                            :type             "Transform"
                                            :source_entity_id branch-eid
                                            :local_entity_id  local-eid})
      (impl/delete-worktree! wt-id)
      (testing "the worktree, its content and its remappings are gone"
        (is (not (t2/exists? :model/Worktree :id wt-id)))
        (is (not (t2/exists? :model/Transform :id tf-id)))
        (is (not (t2/exists? :model/TransformTag :id tag-id)))
        (is (not (t2/exists? :model/Collection :id coll-id)))
        (is (not (t2/exists? :model/WorktreeRemapping :worktree_id wt-id))))
      (testing "other worktrees and the main app are untouched"
        (is (t2/exists? :model/Transform :id other-tf))
        (is (t2/exists? :model/Transform :id main-tf))))))
