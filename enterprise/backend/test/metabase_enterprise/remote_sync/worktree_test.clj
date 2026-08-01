(ns ^:synchronous metabase-enterprise.remote-sync.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [f] (mt/dataset test-data (mt/id) (f))))

(use-fixtures :each
  (fn [f]
    (mt/with-premium-features #{:remote-sync}
      (mt/with-current-user (mt/user->id :crowberto)
        (f)))))

(defn- worktree-id [model id]
  (t2/select-one-fn :worktree_id model :id id))

(deftest worktree-id-is-inherited-from-the-parent-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-a"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}]
    (testing "content created under a worktree collection joins that worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id collection}
                     :model/Dashboard {dashboard :id} {:collection_id collection}
                     :model/DashboardCard {dashcard :id} {:dashboard_id dashboard :card_id card}
                     :model/DashboardTab {tab :id} {:dashboard_id dashboard :position 0}]
        (is (= [worktree worktree worktree worktree]
               [(worktree-id :model/Card card)
                (worktree-id :model/Dashboard dashboard)
                (worktree-id :model/DashboardCard dashcard)
                (worktree-id :model/DashboardTab tab)]))))
    (testing "the parent wins over an explicitly passed worktree_id"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-collection :worktree_id worktree}]
        (is (nil? (worktree-id :model/Card card)))))
    (testing "a sub-collection joins its parent's worktree"
      (mt/with-temp [:model/Collection {child :id} {:location (format "/%d/" collection)}]
        (is (= worktree (worktree-id :model/Collection child)))))
    (testing "content created in the main app has no worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-collection}]
        (is (nil? (worktree-id :model/Card card)))))))

(deftest worktree-membership-is-immutable-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-b"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}]
    (testing "worktree_id cannot be written directly"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
           (t2/update! :model/Card card {:worktree_id nil}))))
    (testing "content cannot be moved out of its worktree"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Card card {:collection_id main-collection}))))
    (testing "content cannot be moved into a worktree"
      (mt/with-temp [:model/Card {main-card :id} {:collection_id main-collection}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
             (t2/update! :model/Card main-card {:collection_id collection})))))
    (testing "a collection cannot be moved out of its worktree"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Collection collection {:location (format "/%d/" main-collection)}))))
    (testing "moves within the same worktree are fine"
      (mt/with-temp [:model/Collection {other :id} {:worktree_id worktree}]
        (is (pos? (t2/update! :model/Card card {:collection_id other})))))))

(deftest entity-ids-are-remapped-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree-1 :id} {:branch "feature-c"}
                 :model/RemoteSyncWorktree {worktree-2 :id} {:branch "feature-d"}
                 :model/Collection {main-collection :id} {}]
    (let [source (t2/select-one-fn :entity_id :model/Collection :id main-collection)
          pull!  (fn [worktree name]
                   (binding [mi/*deserializing?*  true
                             serdes/*worktree-id* worktree]
                     (:id (serdes/load-insert! "Collection" {:name      name
                                                             :location  "/"
                                                             :entity_id source}))))]
      (mt/with-model-cleanup [:model/Collection]
        (let [checkout-1 (pull! worktree-1 "Checked out once")
              checkout-2 (pull! worktree-2 "Checked out twice")]
          (testing "each worktree checks the branch entity out into a row of its own, in that worktree"
            (is (not= checkout-1 checkout-2))
            (is (= [worktree-1 worktree-2]
                   [(worktree-id :model/Collection checkout-1) (worktree-id :model/Collection checkout-2)])))
          (testing "with a fresh entity_id, so the main app's row keeps the one the branch knows"
            (is (= source (t2/select-one-fn :entity_id :model/Collection :id main-collection)))
            (is (not= source (t2/select-one-fn :entity_id :model/Collection :id checkout-1)))
            (is (not= source (t2/select-one-fn :entity_id :model/Collection :id checkout-2))))
          (testing "a lookup resolves to the copy belonging to the worktree being loaded"
            (is (= checkout-1 (binding [serdes/*worktree-id* worktree-1]
                                (:id (serdes/lookup-by-id :model/Collection source)))))
            (is (= checkout-2 (binding [serdes/*worktree-id* worktree-2]
                                (:id (serdes/lookup-by-id :model/Collection source)))))
            (is (= main-collection (:id (serdes/lookup-by-id :model/Collection source)))))
          (testing "and an export writes the branch's id back, not the worktree's own"
            (is (= source (binding [serdes/*worktree-id* worktree-1]
                            (:entity_id (serdes/extract-one "Collection" {}
                                                            (t2/select-one :model/Collection :id checkout-1))))))))))))

(deftest worktree-content-created-locally-gets-a-branch-id-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-l"}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}]
    (let [local (t2/select-one-fn :entity_id :model/Card :id card)
          entry #(t2/select-one :model/RemoteSyncWorktreeRemapping :worktree_id worktree :target_entity_id local)
          push! #(binding [serdes/*worktree-id* worktree]
                   (:entity_id (serdes/extract-one "Card" {} (t2/select-one :model/Card :id card))))]
      (testing "a card made inside the worktree starts with no remapping"
        (is (nil? (entry))))
      (let [exported (push!)]
        (testing "exporting it mints an id for the branch rather than pushing the local one"
          (is (not= local exported))
          (is (=? {:source_entity_id exported} (entry))))
        (testing "and the id is stable across exports"
          (is (= exported (push!))))))))

(deftest worktree-content-is-admin-only-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-e"}
                 :model/Collection {collection-id :id} {:worktree_id worktree}
                 :model/Card {card-id :id} {:collection_id collection-id}]
    (let [collection (t2/select-one :model/Collection :id collection-id)
          card       (t2/select-one :model/Card :id card-id)]
      (testing "admins can read and write worktree content"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (mi/can-read? collection))
          (is (mi/can-write? collection))
          (is (mi/can-read? card))))
      (testing "everyone else cannot"
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? collection)))
          (is (not (mi/can-write? collection)))
          (is (not (mi/can-read? card))))))))

(deftest worktree-collections-are-hidden-from-listings-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-g"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [visible #(set (collection/visible-collection-ids %))]
        (testing "a worktree's collections are not visible by default, even to an admin"
          (is (contains? (visible {}) main-collection))
          (is (not (contains? (visible {}) worktree-collection))))
        (testing "they are when explicitly asked for"
          (is (contains? (visible {:include-worktrees? true}) worktree-collection)))))))

(deftest serdes-ignores-an-ingested-worktree-id-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-i"}]
    (mt/with-model-cleanup [:model/Collection]
      (let [load! (fn [name worktree-id-in-yaml]
                    (:id (serdes/load-insert! "Collection" {:name        name
                                                            :location    "/"
                                                            :entity_id   (u/generate-nano-id)
                                                            :worktree_id worktree-id-in-yaml})))]
        (testing "a pull puts the content in the worktree it is loading, whatever the incoming data claims"
          (is (= worktree (binding [mi/*deserializing?*  true
                                    serdes/*worktree-id* worktree]
                            (worktree-id :model/Collection (load! "Pulled" 999999))))))
        (testing "the plain serdes API only ever loads into the main app"
          (is (nil? (binding [mi/*deserializing?* true]
                      (worktree-id :model/Collection (load! "Imported" worktree))))))))))

(deftest serdes-extraction-is-scoped-to-the-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-j"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}]
    (let [extracted #(into #{}
                           (map :id)
                           (serdes/extract-query "Collection"
                                                 {:where [:in :id [main-collection worktree-collection]]}))]
      (testing "the plain serdes API exports main-app content only"
        (is (= #{main-collection} (extracted))))
      (testing "a worktree push exports that worktree's content only"
        (binding [serdes/*worktree-id* worktree]
          (is (= #{worktree-collection} (extracted))))))))

(deftest worktree-collection-children-match-the-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-h"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection parent {:worktree_id worktree}
                 :model/Collection {child :id} {:location (format "/%d/" (:id parent))}]
    (testing "the children of a worktree collection are its worktree's collections"
      (is (= #{child} (set (map :id (collection/effective-children parent))))))
    (testing "the children of a main-app collection never include worktree collections"
      (is (empty? (collection/effective-children (t2/select-one :model/Collection :id main-collection)))))))

(deftest worktree-collection-items-list-its-content-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-items"}
                 :model/Collection {main-collection :id} {}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Collection {child :id} {:location (format "/%d/" collection)}
                 :model/Card {card :id} {:collection_id collection}
                 :model/Dashboard {dashboard :id} {:collection_id collection}]
    (let [items (fn [collection-id]
                  (->> (mt/user-http-request :crowberto :get 200 (format "collection/%d/items" collection-id))
                       :data
                       (map (juxt :model :id))
                       set))]
      (testing "a worktree collection's items are its cards, dashboards, and sub-collections"
        (is (= #{["card" card] ["dashboard" dashboard] ["collection" child]}
               (items collection))))
      (testing "a main-app collection's items never include worktree content"
        (is (= #{["card" main-card]}
               (items main-collection))))
      (testing "a nested worktree collection's breadcrumbs climb through its worktree ancestors"
        (is (=? {:effective_ancestors [{:id "root"} {:id collection}]}
                (mt/user-http-request :crowberto :get 200 (format "collection/%d" child))))))))

(deftest worktree-content-is-self-contained-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-self-contained"}
                 :model/RemoteSyncWorktree {other-worktree :id} {:branch "feature-other"}
                 :model/Collection {main-synced :id} {:is_remote_synced true}
                 :model/Collection {collection :id} {:worktree_id worktree :is_remote_synced true}
                 :model/Collection {other-collection :id} {:worktree_id other-worktree :is_remote_synced true}
                 :model/Card {worktree-card :id} {:collection_id collection
                                                  :dataset_query (mt/native-query {:query "SELECT 1"})}
                 :model/Card {main-synced-card :id} {:collection_id main-synced
                                                     :dataset_query (mt/native-query {:query "SELECT 1"})}
                 :model/Card {other-worktree-card :id} {:collection_id other-collection
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-model-cleanup [:model/Card]
        (try
          (let [save! (fn [status collection-id source-card-id]
                        (mt/user-http-request :crowberto :post status "card"
                                              {:name                   "New question"
                                               :display                "table"
                                               :visualization_settings {}
                                               :collection_id          collection-id
                                               :dataset_query          (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}))]
            (testing "content in a worktree can use content from the same worktree"
              (is (=? {:collection_id collection}
                      (save! 200 collection worktree-card))))
            (testing "content in a worktree cannot use the main app's remote-synced content"
              (is (= "Uses content from a different remote sync worktree."
                     (:message (save! 400 collection main-synced-card)))))
            (testing "content in a worktree cannot use another worktree's content"
              (is (= "Uses content from a different remote sync worktree."
                     (:message (save! 400 collection other-worktree-card)))))
            (testing "main-app remote-synced content cannot use a worktree's content"
              (is (= "Uses content from a different remote sync worktree."
                     (:message (save! 400 main-synced worktree-card))))))
          (finally
            ;; production worktree deletion (`impl/delete-worktree!`) clears these; with-temp teardown doesn't
            (t2/delete! :model/RemoteSyncObject :worktree_id [:in [worktree other-worktree]])))))))

(deftest worktree-content-is-editable-in-read-only-mode-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-read-only"}
                 :model/Collection {collection :id} {:worktree_id worktree :is_remote_synced true}
                 :model/Collection {main-synced :id} {:is_remote_synced true}
                 :model/Card {worktree-card :id} {:collection_id collection}
                 :model/Card {main-synced-card :id} {:collection_id main-synced}]
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (testing "a worktree is a working copy of its branch, so its content stays writable"
        (is (mi/can-write? (t2/select-one :model/Card :id worktree-card))))
      (testing "the main app's remote-synced content is read-only"
        (is (not (mi/can-write? (t2/select-one :model/Card :id main-synced-card))))))))

(deftest worktree-transforms-are-editable-in-read-only-mode-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-transforms-editable"}
                 :model/Collection {collection :id} {:worktree_id worktree :namespace "transforms"}
                 :model/Transform {worktree-transform :id} {:name          "Worktree transform"
                                                            :collection_id collection
                                                            :source        {:type  :query
                                                                            :query (let [mp (mt/metadata-provider)]
                                                                                     (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
                                                            :target        {:type   "table"
                                                                            :schema "public"
                                                                            :name   "worktree_editable_target"}}
                 :model/Transform {main-transform :id} {:name   "Main transform"
                                                        :source {:type  :query
                                                                 :query (let [mp (mt/metadata-provider)]
                                                                          (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
                                                        :target {:type   "table"
                                                                 :schema "public"
                                                                 :name   "main_editable_target"}}]
    (mt/with-premium-features #{:remote-sync :hosting :transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-type :read-only]
        (testing "a worktree transform is a working copy of its branch, so it stays writable for an admin"
          (is (mi/can-write? (t2/select-one :model/Transform :id worktree-transform))))
        (testing "a transform can still be created into the worktree, explicitly or via its collection"
          (let [source {:type  :query
                        :query (let [mp (mt/metadata-provider)]
                                 (lib/query mp (lib.metadata/table mp (mt/id :venues))))}]
            (is (mi/can-create? :model/Transform {:worktree_id worktree :source source}))
            (is (mi/can-create? :model/Transform {:collection_id collection :source source}))))
        (testing "main-app transforms are read-only"
          (is (not (mi/can-write? (t2/select-one :model/Transform :id main-transform))))
          (is (not (mi/can-create? :model/Transform
                                   {:source {:type  :query
                                             :query (let [mp (mt/metadata-provider)]
                                                      (lib/query mp (lib.metadata/table mp (mt/id :venues))))}}))))))))

(deftest worktree-snippets-can-be-created-in-read-only-mode-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-snippets-editable"}]
    (try
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-type :read-only]
          (testing "an admin can create a snippet at the worktree's root"
            (is (=? {:worktree_id worktree}
                    (mt/user-http-request :crowberto :post 200 "native-query-snippet"
                                          {:name        "worktree snippet"
                                           :content     "1 = 1"
                                           :worktree_id worktree}))))
          (testing "worktree content stays admin-only"
            (mt/user-http-request :rasta :post 403 "native-query-snippet"
                                  {:name        "rasta worktree snippet"
                                   :content     "1 = 1"
                                   :worktree_id worktree}))))
      (finally
        (t2/delete! :model/NativeQuerySnippet :worktree_id worktree)))))

(deftest worktree-sync-outcome-reports-the-worktree-branch-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-outcome"}
                 :model/RemoteSyncTask {task-id :id} {:sync_task_type "import"
                                                      :initiated_by   (mt/user->id :crowberto)
                                                      :worktree_id    worktree}]
    (mt/with-temporary-setting-values [remote-sync-branch "main"]
      (impl/handle-task-result! {:status :success :outcome {:kind "pulled" :count 1}} task-id
                                :branch "feature-outcome" :worktree-id worktree)
      (testing "a worktree task's outcome reports the worktree's own branch"
        (is (=? {:kind "pulled" :branch "feature-outcome"}
                (t2/select-one-fn :outcome :model/RemoteSyncTask :id task-id))))
      (testing "and never touches the main app's remote-sync-branch setting"
        (is (= "main" (remote-sync.settings/remote-sync-branch)))))))

(deftest worktree-transforms-never-run-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-k"}
                 :model/Collection {collection :id} {:worktree_id worktree :namespace "transforms"}
                 :model/Transform {transform :id} {:name          "Worktree transform"
                                                   :collection_id collection
                                                   :source        {:type  :query
                                                                   :query (let [mp (mt/metadata-provider)]
                                                                            (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
                                                   :target        {:type   "table"
                                                                   :schema "public"
                                                                   :name   "worktree_target"}}
                 :model/TransformTag {tag :id} {:name "worktree-tag"}
                 :model/TransformJob {job :id} {:name "worktree-job" :schedule "0 0 0 * * ?"}
                 :model/TransformJobTransformTag _ {:job_id job :tag_id tag :position 0}
                 :model/TransformTransformTag _ {:transform_id transform :tag_id tag :position 0}]
    (mt/with-premium-features #{:remote-sync :hosting :transforms-basic}
      (testing "tags can still be attached, but the transform is left out of the job's run"
        (is (empty? (transforms.jobs/job-transforms job))))
      (testing "and it cannot be run by hand"
        (is (= "Transforms in a remote sync worktree cannot be run."
               (mt/user-http-request :crowberto :post 400 (format "transform/%d/run" transform)))))
      (testing "the UI is told as much"
        (is (false? (:can_execute (t2/hydrate (t2/select-one :model/Transform :id transform) :can_execute))))))))

(deftest delete-worktree!-removes-its-content-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-f"}
                 :model/Collection {main-collection :id} {}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}
                 :model/Dashboard {dashboard :id} {:collection_id collection}
                 :model/DashboardCard {dashcard :id} {:dashboard_id dashboard :card_id card}]
    (t2/insert! :model/RemoteSyncWorktreeRemapping {:worktree_id      worktree
                                                    :source_entity_id (u/generate-nano-id)
                                                    :target_entity_id (u/generate-nano-id)})
    (impl/delete-worktree! worktree)
    (testing "the worktree, its collections, their contents, and its remappings are gone"
      (is (not (t2/exists? :model/RemoteSyncWorktree :id worktree)))
      (is (not (t2/exists? :model/RemoteSyncWorktreeRemapping :worktree_id worktree)))
      (is (not (t2/exists? :model/Collection :id collection)))
      (is (not (t2/exists? :model/Card :id card)))
      (is (not (t2/exists? :model/Dashboard :id dashboard)))
      (is (not (t2/exists? :model/DashboardCard :id dashcard))))
    (testing "main-app content is untouched"
      (is (t2/exists? :model/Card :id main-card))
      (is (t2/exists? :model/Collection :id main-collection)))))

(deftest worktree-crud-test
  (testing "GET /api/ee/remote-sync/worktree lists worktrees"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-crud"}]
      (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "ee/remote-sync/worktree")))
                     worktree))
      (is (=? {:id worktree :branch "feature-crud"}
              (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/worktree/%d" worktree))))))
  (testing "POST /api/ee/remote-sync/worktree creates one, and refuses a duplicate branch"
    (let [{worktree :id} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/worktree"
                                               {:branch "feature-created"})]
      (is (= "feature-created" (t2/select-one-fn :branch :model/RemoteSyncWorktree :id worktree)))
      (is (= "A worktree for branch 'feature-created' already exists."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/worktree" {:branch "feature-created"})))
      (testing "DELETE /api/ee/remote-sync/worktree/:id removes it"
        (mt/user-http-request :crowberto :delete 204 (format "ee/remote-sync/worktree/%d" worktree))
        (is (not (t2/exists? :model/RemoteSyncWorktree :id worktree))))))
  (testing "everything is superuser-only"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-perms"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/remote-sync/worktree")))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "ee/remote-sync/worktree/%d" worktree))))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/worktree" {:branch "nope"})))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (format "ee/remote-sync/worktree/%d" worktree)))))))

(deftest snippet-listing-is-scoped-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-snippet-list"}
                 :model/Collection {snippet-collection :id} {:namespace "snippets" :worktree_id worktree}
                 :model/NativeQuerySnippet {main-snippet :id} {:name "main-app snippet"}
                 :model/NativeQuerySnippet {worktree-snippet :id} {:name "checked-out snippet"
                                                                   :collection_id snippet-collection}]
    (testing "the default listing is the main app's"
      (let [ids (set (map :id (mt/user-http-request :crowberto :get 200 "native-query-snippet")))]
        (is (contains? ids main-snippet))
        (is (not (contains? ids worktree-snippet)))))
    (testing "?worktree-id= returns only that worktree's snippets"
      (is (= [worktree-snippet]
             (map :id (mt/user-http-request :crowberto :get 200 "native-query-snippet"
                                            :worktree-id worktree)))))
    (testing "worktree snippets are admin-only"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "native-query-snippet"
                                   :worktree-id worktree))))))

(deftest collection-listings-are-scoped-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-collection-list"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}]
    (testing "GET /api/collection?worktree-id= returns the virtual root plus the worktree's collections"
      (let [ids (set (map :id (mt/user-http-request :crowberto :get 200 "collection"
                                                    :worktree-id worktree)))]
        (is (= #{"root" worktree-collection} ids))
        (is (not (contains? ids main-collection)))))
    (testing "GET /api/collection/tree?worktree-id= returns only the worktree's collections"
      (is (= [worktree-collection]
             (map :id (mt/user-http-request :crowberto :get 200 "collection/tree"
                                            :worktree-id worktree)))))
    (testing "worktree listings are admin-only"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "collection" :worktree-id worktree)))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "collection/tree" :worktree-id worktree))))))

(deftest worktree-content-is-not-indexed-for-search-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-search"}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}
                 :model/Collection {main-collection :id} {}
                 :model/Card {worktree-card :id} {:collection_id worktree-collection}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Dashboard {worktree-dashboard :id} {:collection_id worktree-collection}
                 :model/Dashboard {main-dashboard :id} {:collection_id main-collection}]
    (let [indexed-ids (fn [search-model ids]
                        (->> (-> (#'search.ingestion/spec-index-query-where search-model [:in :this.id ids])
                                 (assoc :select [[:this.id :id]])
                                 t2/query)
                             (map :id)
                             set))]
      (testing "worktree cards are not fed to the search index"
        (is (= #{main-card} (indexed-ids "card" [main-card worktree-card]))))
      (testing "worktree dashboards are not fed to the search index"
        (is (= #{main-dashboard} (indexed-ids "dashboard" [main-dashboard worktree-dashboard]))))
      (testing "worktree collections are not fed to the search index"
        (is (= #{main-collection}
               (indexed-ids "collection" [main-collection worktree-collection])))))))

(deftest create-collection-in-worktree-api-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-new-collection"}]
    (mt/with-model-cleanup [:model/Collection]
      (try
        (testing "POST /api/ee/remote-sync/worktree/:id/collection creates a root collection in the worktree"
          (let [{collection :id} (mt/user-http-request :crowberto :post 200
                                                       (format "ee/remote-sync/worktree/%d/collection" worktree)
                                                       {:name "Worktree folder"
                                                        :description "A place for things"})]
            (is (=? {:worktree_id      worktree
                     :location         "/"
                     :description      "A place for things"
                     :is_remote_synced true}
                    (t2/select-one :model/Collection :id collection)))
            (testing "content created inside it joins the worktree"
              (mt/with-temp [:model/Card {card :id} {:collection_id collection}]
                (is (= worktree (worktree-id :model/Card card)))))))
        (testing "404s for an unknown worktree"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :post 404 "ee/remote-sync/worktree/13371337/collection"
                                       {:name "nope"}))))
        (testing "superuser-only"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403
                                       (format "ee/remote-sync/worktree/%d/collection" worktree)
                                       {:name "nope"}))))
        (finally
          ;; production worktree deletion (`impl/delete-worktree!`) clears these; with-temp teardown doesn't
          (t2/delete! :model/RemoteSyncObject :worktree_id worktree))))))

(deftest create-namespaced-collection-at-worktree-root-api-test
  (testing "POST /api/collection with a namespace and a worktree_id but no parent lands at the branch's namespace root"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-namespace-root"}]
      (mt/with-model-cleanup [:model/Collection]
        (try
          (doseq [collection-namespace ["transforms" "snippets"]]
            (testing collection-namespace
              (let [{collection :id} (mt/user-http-request :crowberto :post 200 "collection"
                                                           {:name        (str "Branch " collection-namespace " folder")
                                                            :namespace   collection-namespace
                                                            :parent_id   nil
                                                            :worktree_id worktree})]
                (is (=? {:worktree_id      worktree
                         :namespace        (keyword collection-namespace)
                         :location         "/"
                         :is_remote_synced true}
                        (t2/select-one :model/Collection :id collection)))
                (testing "and it is listed under that worktree's namespace, not the main app's"
                  (is (some #(= collection (:id %))
                            (mt/user-http-request :crowberto :get 200 "collection"
                                                  :namespace collection-namespace
                                                  :worktree-id worktree)))
                  (is (not-any? #(= collection (:id %))
                                (mt/user-http-request :crowberto :get 200 "collection"
                                                      :namespace collection-namespace)))))))
          (testing "worktree content stays admin-only"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "collection"
                                         {:name        "rasta branch folder"
                                          :namespace   "snippets"
                                          :parent_id   nil
                                          :worktree_id worktree}))))
          (finally
            ;; production worktree deletion (`impl/delete-worktree!`) clears these; with-temp teardown doesn't
            (t2/delete! :model/RemoteSyncObject :worktree_id worktree)))))))

(deftest worktree-changes-are-tracked-in-their-own-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-dirty-tracking"}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree :is_remote_synced true}
                 :model/Card card {:dataset_query (mt/mbql-query venues)
                                   :collection_id worktree-collection}]
    (try
      (t2/delete! :model/RemoteSyncObject :model_type "Card" :model_id (:id card))
      (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :crowberto)})
      (testing "the tracking row carries the worktree, so the change lands in the worktree's dirty state"
        (is (=? {:model_type  "Card"
                 :worktree_id worktree}
                (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card)))))
      (finally
        ;; production worktree deletion (`impl/delete-worktree!`) clears these; with-temp teardown doesn't
        (t2/delete! :model/RemoteSyncObject :worktree_id worktree)))))

(deftest worktree-id-is-exposed-by-entity-detail-endpoints-test
  (testing "the branch indicator on a hosted entity page is driven by worktree_id on the wire"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-detail-endpoints"}
                   :model/Collection {collection :id} {:worktree_id worktree}
                   :model/Card {card :id} {:collection_id collection}
                   :model/Dashboard {dashboard :id} {:collection_id collection}
                   :model/Document {document :id} {:collection_id collection
                                                   :name "Branch doc"
                                                   :document (documents.test-util/text->prose-mirror-ast "Branch doc")}]
      (is (= [worktree worktree worktree]
             [(:worktree_id (mt/user-http-request :crowberto :get 200 (format "card/%d" card)))
              (:worktree_id (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" dashboard)))
              (:worktree_id (mt/user-http-request :crowberto :get 200 (format "document/%d" document)))])))))
