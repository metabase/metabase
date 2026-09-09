(ns metabase-enterprise.remote-sync.worktree-test
  "Tests for remote-sync worktrees: the admin-only worktree API, the entity_id remapping serdes resolves through,
  and what deleting a worktree takes with it. The rules that pin a piece of content to one worktree are tested
  alongside the models they guard."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; A pull reindexes search, and on H2 that runs synchronously: creating the index table is DDL, which would commit
;; the rollback-only transaction `with-temp` runs in and leak the test's rows. Nothing here asserts on the index.
(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (f))))

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
(def ^:private second-local-eid "second-local-copy-xxx")

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
      (testing "a branch id whose local row is gone is re-pointed rather than recorded twice"
        (is (= branch-eid (serdes/ensure-remapping! "Transform" second-local-eid branch-eid)))
        (is (= 1 (t2/count :model/WorktreeRemapping :worktree_id wt-id)))
        (is (= second-local-eid (serdes/local-entity-id "Transform" branch-eid)))
        (is (= local-eid (serdes/source-entity-id "Transform" local-eid))
            "the id it used to name is no longer remapped"))
      (testing "forgetting a remapping frees the branch id for the next pull"
        (serdes/forget-remappings! "Transform" [second-local-eid])
        (is (zero? (t2/count :model/WorktreeRemapping :worktree_id wt-id :type "Transform")))
        (is (= branch-eid (serdes/ensure-remapping! "Transform" local-eid branch-eid))))
      (testing "content created inside the worktree gets a branch id of its own"
        (let [source (serdes/ensure-remapping! "Transform" fresh-eid)]
          (is (some? source))
          (is (not= fresh-eid source))))
      (testing "batch resolution passes ids the worktree hasn't checked out through unchanged"
        (is (= #{local-eid "not-checked-out-in-wt"}
               (serdes/local-entity-ids "Transform" [branch-eid "not-checked-out-in-wt"])))))))

(deftest worktree-scoped-models-test
  (testing "collections, everything in them, and the data-model content on shared tables are checked out"
    (is (every? serdes/worktree-scoped? ["Card" "Collection" "Dashboard" "Document" "Measure"
                                         "NativeQuerySnippet" "PythonLibrary" "Segment" "Timeline"
                                         "Transform" "TransformTag" "TransformTransformTag"])))
  (testing "the shared warehouse metadata itself is skipped by a worktree pull"
    (is (not-any? serdes/worktree-scoped? ["Table" "Field"])))
  (testing "so are the models inlined into a parent, which are covered by the parent's own scope"
    (is (not-any? serdes/worktree-scoped? ["DashboardCard" "DashboardCardSeries" "DashboardTab"
                                           "TimelineEvent"]))))

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

;;; ------------------------------------------- Pulling into a worktree -------------------------------------------

(def ^:private pull-coll-eid "wt-pull-collectionxxx")
(def ^:private pull-card-eid "wt-pull-cardxxxxxxxxx")

(defn- pull-files
  "A branch holding one remote-synced collection with one card in it."
  []
  {"main" {"collections/wt_pull_collection/wt_pull_collection.yaml"
           (rs.test/generate-collection-yaml pull-coll-eid "WT Pull Collection")

           "collections/wt_pull_collection/cards/wt_pull_card.yaml"
           (rs.test/generate-card-yaml pull-card-eid "WT Pull Card" pull-coll-eid)}})

(defn- pull!
  "Runs a pull of `files` (by default [[pull-files]]) into `worktree-id` (nil is the main app), passing `opts`
  (`:force?` and friends) on to the import."
  ([worktree-id]
   (pull! worktree-id (pull-files)))
  ([worktree-id files]
   (pull! worktree-id files nil))
  ([worktree-id files opts]
   (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask
                                          {:sync_task_type "import"
                                           :initiated_by   (mt/user->id :crowberto)
                                           :worktree_id    worktree-id})]
     (binding [serdes/*worktree-id* worktree-id]
       (let [result (apply impl/import!
                           (source.p/snapshot (rs.test/create-mock-source :initial-files files))
                           task-id
                           (mapcat identity opts))]
         (impl/handle-task-result! result task-id)
         result)))))

(deftest pull-checks-out-cards-into-the-worktree-test
  (testing "a worktree pull checks out the branch's cards as its own copies"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (mt/with-temp [:model/Worktree {wt-id :id} {}]
          ;; the branch's card names the test-data database; materialize it before the pull looks it up
          (mt/id)
          (is (= :success (:status (pull! nil))) "the main app pulls the branch first")
          (let [main-card (t2/select-one :model/Card :entity_id pull-card-eid)]
            (is (some? main-card) "the main app has the branch's card")
            (is (nil? (:worktree_id main-card)))
            (is (= :success (:status (pull! wt-id))) "then the same branch is checked out into a worktree")
            (let [wt-cards (t2/select :model/Card :worktree_id wt-id)]
              (testing "the worktree gets a copy of its own"
                (is (= 1 (count wt-cards)))
                (is (= "WT Pull Card" (:name (first wt-cards))))
                (is (not= (:id main-card) (:id (first wt-cards)))))
              (testing "under an entity_id of its own, remapped back to what the branch calls it"
                (is (not= pull-card-eid (:entity_id (first wt-cards))))
                (is (= pull-card-eid
                       (t2/select-one-fn :source_entity_id :model/WorktreeRemapping
                                         :worktree_id     wt-id
                                         :type            "Card"
                                         :local_entity_id (:entity_id (first wt-cards))))))
              (testing "and it lands in the worktree's copy of the collection, not the main app's"
                (is (= wt-id (t2/select-one-fn :worktree_id :model/Collection
                                               :id (:collection_id (first wt-cards)))))))
            (testing "the main app's card is left alone"
              (is (= main-card (t2/select-one :model/Card :id (:id main-card)))))))))))

(def ^:private public-card-eid "wt-public-cardxxxxxxx")
(def ^:private branch-public-uuid "0e5f6a3b-1c2d-4e5f-8a9b-0c1d2e3f4a5b")

(defn- public-card-files
  "A branch holding one collection with one publicly shared card in it."
  []
  {"main" {"collections/wt_pull_collection/wt_pull_collection.yaml"
           (rs.test/generate-collection-yaml pull-coll-eid "WT Pull Collection")

           "collections/wt_pull_collection/cards/wt_public_card.yaml"
           (str/replace (rs.test/generate-card-yaml public-card-eid "WT Public Card" pull-coll-eid)
                        "public_uuid: null"
                        (str "public_uuid: " branch-public-uuid))}})

(deftest worktree-copy-drops-public-sharing-test
  (testing "a worktree's copy of a publicly shared card does not take the branch's public_uuid"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (mt/with-temp [:model/Worktree {wt-id :id} {}]
          (mt/id)
          (is (= :success (:status (pull! nil (public-card-files)))) "the main app pulls the branch first")
          (is (= branch-public-uuid (t2/select-one-fn :public_uuid :model/Card :entity_id public-card-eid))
              "the main app's card is the publicly shared one")
          (is (= :success (:status (pull! wt-id (public-card-files))))
              "checking the same branch out into a worktree does not collide on the unique public_uuid")
          (let [wt-card (t2/select-one :model/Card :worktree_id wt-id)]
            (is (some? wt-card))
            (is (nil? (:public_uuid wt-card)))
            (is (nil? (:made_public_by_id wt-card)))
            (is (false? (:enable_embedding wt-card)))))))))

(deftest re-pull-after-local-delete-test
  (testing "a branch entity whose worktree copy was deleted can be pulled again"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (mt/with-temp [:model/Worktree {wt-id :id} {}]
          (mt/id)
          (is (= :success (:status (pull! wt-id))))
          (let [first-copy (t2/select-one :model/Card :worktree_id wt-id)]
            (is (some? first-copy))
            ;; the admin throws the worktree's copy away, but its remapping stays behind
            (t2/delete! :model/Card :id (:id first-copy))
            (is (= :success (:status (pull! wt-id (pull-files) {:force? true})))
                "the branch can be pulled again")
            (let [second-copy (t2/select-one :model/Card :worktree_id wt-id)]
              (is (some? second-copy))
              (is (not= (:id first-copy) (:id second-copy)))
              (testing "and the branch id names the new copy, once"
                (is (= [(:entity_id second-copy)]
                       (t2/select-fn-vec :local_entity_id :model/WorktreeRemapping
                                         :worktree_id      wt-id
                                         :type             "Card"
                                         :source_entity_id pull-card-eid)))))))))))

;;; ------------------------------------------- Pushing from a worktree -------------------------------------------

(deftest worktree-push-stages-no-deletions-test
  (testing "a worktree push leaves the branch alone when nothing is dirty, whatever the main app syncs"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms false]
        (mt/with-temp [:model/Worktree {wt-id :id} {}]
          (let [files   {"main" {"transforms/my_transform.yaml"       "name: My Transform\n"
                                 "python-libraries/common.py"         "x = 1\n"
                                 "snippets/my_snippet.yaml"           "name: My Snippet\n"}}
                mock    (rs.test/create-mock-source :initial-files files)
                task-id (t2/insert-returning-pk! :model/RemoteSyncTask
                                                 {:sync_task_type "export"
                                                  :initiated_by   (mt/user->id :crowberto)
                                                  :worktree_id    wt-id})
                result  (binding [serdes/*worktree-id* wt-id]
                          (impl/export! (source.p/snapshot mock) task-id "nothing to push"))]
            (is (= :success (:status result)))
            (is (= "push-skipped" (:kind (:outcome result))))
            (is (= (get files "main") (get @(:files-atom mock) "main"))
                "the branch's transforms, python libraries and snippets are still there")))))))

(deftest worktree-content-eligibility-comes-from-the-row-test
  (testing "a worktree's transforms collection is tracked at event time, when no sync scope is bound"
    (mt/with-premium-features #{:remote-sync :transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms false]
        (mt/with-temp [:model/Worktree {wt-id :id} {}
                       :model/Collection wt-coll {:name        "WT Transforms"
                                                  :namespace   collection/transforms-ns
                                                  :location    "/"
                                                  :worktree_id wt-id}
                       :model/Collection main-coll {:name      "Main Transforms"
                                                    :namespace collection/transforms-ns
                                                    :location  "/"}]
          (is (nil? serdes/*worktree-id*) "event-time tracking runs outside any sync")
          (let [coll-spec (spec/spec-for-model-key :model/Collection)]
            (is (true? (spec/check-eligibility coll-spec wt-coll))
                "the worktree syncs its own transform content whatever the main app's setting says")
            (is (false? (spec/check-eligibility coll-spec main-coll))
                "and the main app's is still decided by the setting")))))))

;;; ------------------------------------ References out of a worktree ------------------------------------

(deftest worktree-export-keeps-main-app-references-test
  (testing "a worktree's content names the main-app rows it references by their own entity_id"
    (mt/with-premium-features #{:remote-sync :transforms-basic}
      (mt/with-temp [:model/Worktree {wt-id :id} {}
                     :model/Card {main-card-id :id main-card-eid :entity_id}
                     {:name          "Main Source Card"
                      :dataset_query (let [mp (mt/metadata-provider)]
                                       (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
                     :model/Collection {coll-id :id} {:name        "WT Transforms"
                                                      :namespace   collection/transforms-ns
                                                      :location    "/"
                                                      :worktree_id wt-id}
                     :model/Transform transform {:name          "WT Transform"
                                                 :collection_id coll-id
                                                 :worktree_id   wt-id
                                                 :source        {:type  "query"
                                                                 :query (let [mp (mt/metadata-provider)]
                                                                          (lib/query mp (lib.metadata/card mp main-card-id)))}}]
        (let [extracted (binding [serdes/*worktree-id* wt-id]
                          (serdes/extract-one "Transform" {} (t2/hydrate transform :tags :indexes)))
              strings   (into #{} (filter string?) (tree-seq coll? seq extracted))]
          (testing "the reference is the main app's own entity_id"
            (is (contains? strings main-card-eid)))
          (testing "and nothing was minted for it"
            (is (not (t2/exists? :model/WorktreeRemapping :worktree_id wt-id :type "Card"))))
          (testing "while the worktree's own row is still remapped to what the branch calls it"
            (is (t2/exists? :model/WorktreeRemapping
                            :worktree_id     wt-id
                            :type            "Transform"
                            :local_entity_id (:entity_id transform)))))))))
