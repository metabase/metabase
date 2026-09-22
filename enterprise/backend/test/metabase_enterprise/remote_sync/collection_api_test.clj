(ns ^:synchronized metabase-enterprise.remote-sync.collection-api-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.collection-api-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [diehard.core :as dh]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :each
  (fn [f]
    (mt/with-temporary-setting-values [settings/remote-sync-type :read-write]
      (f))))

(deftest create-collection-inherits-parent-type-test
  (testing "POST /api/collection"
    (testing "Child collection inherits parent's type"
      (mt/with-model-cleanup [:model/Collection]
        (mt/with-temp [:model/Collection parent {:name "Parent"
                                                 :is_remote_synced true}]
          (let [child (mt/user-http-request :crowberto :post 200 "collection"
                                            {:name "Child"
                                             :parent_id (:id parent)})]
            (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id child))))))))))

(deftest update-collection-is-remote-synced-to-false-cascades-test
  (testing "PUT /api/collection/:id"
    (testing "Updating parent collection type to nil cascades to children"
      (mt/with-model-cleanup [:model/Collection]
        (mt/with-temp [:model/Collection {grandparent-id :id} {:is_remote_synced true}
                       :model/Collection {parent-id :id} {:name "Parent"
                                                          :location (str "/" grandparent-id "/")
                                                          :is_remote_synced true}
                       :model/Collection {child-id :id} {:name "Child"
                                                         :location (str "/" grandparent-id "/" parent-id "/")
                                                         :is_remote_synced true}]
          (mt/user-http-request :crowberto :put 200 (str "collection/" parent-id)
                                {:parent_id nil})
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id parent-id)))
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id child-id))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-success-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Moving a collection into remote-synced parent succeeds when no remote-sync violations"
      (mt/with-temp [:model/Collection remote-parent {:name "Remote Parent" :is_remote_synced true}
                     :model/Collection regular-collection {:name "Regular Collection"}]
        (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (:id regular-collection))
                                             {:parent_id (:id remote-parent)})]
          (is (= (:id remote-parent) (:parent_id response)))
          (is (true? (:is_remote_synced response)))
          (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id regular-collection)))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-failure-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Moving a collection into remote-synced parent fails when remote-sync violations exist"
      (mt/with-temp [:model/Collection remote-parent {:name "Remote Parent" :is_remote_synced true}
                     :model/Collection regular-collection {:name "Regular Collection"}
                     :model/Card {up-card-id :id} {:dataset_query (mt/mbql-query venues)}
                     :model/Card _ {:collection_id (:id regular-collection)
                                    :dataset_query (mt/mbql-query nil {:source-table (str "card__" up-card-id)})}]
        (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id regular-collection))
                                             {:parent_id (:id remote-parent)})]
          (is (str/includes? (str response) "remote-synced"))
          (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id regular-collection))))
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id regular-collection)))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-transaction-rollback-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Transaction rollback on dependency check failure leaves database unchanged"
      (mt/with-temp [:model/Collection remote-parent {:name "Remote Parent" :is_remote_synced true}
                     :model/Collection regular-collection {:name "Regular Collection"}
                     :model/Collection child-collection {:name "Child Collection"
                                                         :location (collection/children-location regular-collection)}
                     :model/Card {up-card-id :id} {:dataset_query (mt/mbql-query venues)}
                     :model/Card _ {:collection_id (:id child-collection)
                                    :dataset_query (mt/mbql-query nil {:source-table (str "card__" up-card-id)})}]
        (mt/user-http-request :crowberto :put 400 (str "collection/" (:id regular-collection))
                              {:parent_id (:id remote-parent)})
        (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id regular-collection))))
        (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id regular-collection))))
        (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id child-collection))))))))

(deftest api-move-collection-outside-remote-synced-no-dependency-checking-test
  (testing "PUT /api/collection/:id - move collection out of remote-synced"
    (testing "Moving a collection OUT of remote-synced parent does not check dependencies"
      (mt/with-temp [:model/Collection remote-parent {:name "Remote Parent" :is_remote_synced true}
                     :model/Collection child-collection {:name "Child Collection"
                                                         :location (collection/children-location remote-parent)
                                                         :is_remote_synced true}
                     :model/Card _ {:collection_id (:id child-collection)
                                    :document_id nil}]
        (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id child-collection))))
        (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (:id child-collection))
                                             {:parent_id nil})]
          (is (nil? (:parent_id response)))
          (is (false? (:is_remote_synced response)))
          (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id child-collection))))
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id child-collection)))))))))

(defn- push-via-api!
  "Pushes through `POST /api/ee/remote-sync/export` and waits for the export task to finish."
  []
  (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main"})]
    (dh/with-retry {:max-retries 20 :delay-ms 250}
      (u/prog1 (t2/select-one :model/RemoteSyncTask :id task_id)
        (when (nil? (:ended_at <>))
          (throw (ex-info "Not finished" {:task-id task_id})))))))

(defn- exported-entity-ids
  "The entity_ids that have their own file in the current snapshot of `src`."
  [src]
  (let [snapshot (source.p/snapshot src)]
    (into #{}
          (keep (fn [path]
                  (try (:entity_id (yaml/parse-string (source.p/read-file snapshot path)))
                       (catch Exception _ nil))))
          (source.p/list-files snapshot))))

(deftest archive-collection-removes-nested-content-from-remote-test
  (testing "GHY-4399: archiving a collection inside a synced collection removes its whole subtree from the remote
            on the next push, not only the collection's own file"
    (test-helpers/clean-remote-sync-state
     (fn []
       (test-helpers/commit-with-temp
        (fn []
          (mt/with-premium-features #{:remote-sync}
            (mt/with-model-cleanup [:model/Card :model/Collection]
              (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :is_remote_synced true :location "/"}]
                (let [src (test-helpers/versioned-source :current "v-remote" :trees {"v-remote" {}})]
                  (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                                     remote-sync-token  "test-token"
                                                     remote-sync-branch "main"]
                    (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly src)]
                      (let [folder     (mt/user-http-request :crowberto :post 200 "collection"
                                                             {:name "Bug Repro" :parent_id synced-id})
                            sub-folder (mt/user-http-request :crowberto :post 200 "collection"
                                                             {:name "Sub Folder" :parent_id (:id folder)})
                            new-card   (fn [card-name coll-id]
                                         (mt/user-http-request :crowberto :post 200 "card"
                                                               {:name                   card-name
                                                                :display                "table"
                                                                :dataset_query          (mt/mbql-query venues)
                                                                :visualization_settings {}
                                                                :collection_id          coll-id}))
                            card       (new-card "Card In Folder" (:id folder))
                            sub-card   (new-card "Card In Sub Folder" (:id sub-folder))
                            subtree    (set (map :entity_id [folder sub-folder card sub-card]))]
                        (is (=? {:outcome {:kind "pushed"}} (push-via-api!)) "first push pushes")
                        (is (= subtree (into #{} (filter subtree) (exported-entity-ids src)))
                            "precondition: the folder, its sub-folder, and both cards are on the remote")
                        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id folder)) {:archived true})
                        (is (=? {:outcome {:kind "pushed"}} (push-via-api!)) "second push pushes")
                        (is (= #{} (into #{} (filter subtree) (exported-entity-ids src)))
                            "no file from the archived subtree stays on the remote"))))))))))))))
