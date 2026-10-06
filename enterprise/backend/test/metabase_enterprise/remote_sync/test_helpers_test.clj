(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for test-helpers: the MockSource implementation and the clean-remote-sync-state fixture."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.actions.models :as action]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.core :as lib]
   [metabase.search.core :as search]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- write-files!
  "Wholesale-write `files` ({:path :content}) to `snapshot` via the commit builder (clear managed dirs,
  stage every file, push)."
  [snapshot message files]
  (let [c (source.p/open-commit snapshot)]
    (source.p/replace-all! c)
    (doseq [f files] (source.p/stage-upsert! c f))
    (source.p/finish-commit! c message)))

(deftest mock-source-write-files-managed-dir-cleanup-test
  (testing "MockSource removes files in managed dirs not in write set"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "collections/abc/file2.yaml" "content2"
                                          "collections/def/file3.yaml" "content3"
                                          "other/file4.yaml" "content4"}}
                  :managed-dirs #{"collections"})
          snapshot (source.p/snapshot source)]
      (write-files! snapshot "Write only abc"
                    [{:path "collections/abc/file1.yaml" :content "new-content1"}])
      (is (= #{"collections/abc/file1.yaml" "other/file4.yaml"}
             (set (source.p/list-files snapshot)))
          "Only written files in managed dirs should remain; unmanaged dirs untouched"))))

(deftest mock-source-write-files-unmanaged-preserved-test
  (testing "MockSource preserves files in unmanaged directories"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "unmanaged/file2.yaml" "content2"}}
                  :managed-dirs #{"collections"})
          snapshot (source.p/snapshot source)]
      (write-files! snapshot "Write collections"
                    [{:path "collections/abc/file1.yaml" :content "new-content"}])
      (is (= #{"collections/abc/file1.yaml" "unmanaged/file2.yaml"}
             (set (source.p/list-files snapshot)))
          "Unmanaged directory files should be preserved"))))

(deftest mock-source-write-files-empty-managed-dir-cleanup-test
  (testing "MockSource cleans managed dir even when no files written to it"
    (let [source (th/create-mock-source
                  :initial-files {"main" {"collections/abc/file1.yaml" "content1"
                                          "snippets/old.yaml" "old-snippet"}}
                  :managed-dirs #{"collections" "snippets"})
          snapshot (source.p/snapshot source)]
      ;; Write only to collections, nothing to snippets
      (write-files! snapshot "Write only collections"
                    [{:path "collections/abc/file1.yaml" :content "new-content"}])
      (is (= #{"collections/abc/file1.yaml"}
             (set (source.p/list-files snapshot)))
          "Snippets dir should be cleaned even though no snippet files were written"))))

(defn- content-ids
  "Ids of the main app's cards, dashboards and non-personal collections (test users' personal collections
  are created lazily, so they are left out)."
  []
  {:cards       (t2/select-pks-set :model/Card)
   :dashboards  (t2/select-pks-set :model/Dashboard)
   :collections (t2/select-pks-set :model/Collection :personal_owner_id nil)})

(deftest clean-remote-sync-state-removes-imported-content-test
  (testing "content a test imports into the main app is gone once the clean-remote-sync-state fixture ends"
    (mt/dataset test-data
      (mt/id) ; the mock source's card references test-data
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (let [before (content-ids)]
          (th/clean-remote-sync-state
           (fn []
             (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                           :initiated_by   (mt/user->id :rasta)})]
               (is (= :success (:status (impl/import! (source.p/snapshot (th/create-mock-source)) task-id))))
               (is (t2/exists? :model/Card :name "Some Question")))))
          (is (= before (content-ids))))))))

(deftest clean-remote-sync-state-removes-collection-contents-test
  (testing "the actions, documents and data apps that a test creates are gone once the clean-remote-sync-state fixture ends"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (let [ids (atom {})]
        (try
          (th/clean-remote-sync-state
           (fn []
             (let [coll-id (t2/insert-returning-pk! :model/Collection {:name "Imported" :location "/"})
                   ;; this action has no model, so no cascade from a deleted card removes it
                   act-id  (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                          {:type          :query
                                                           :name          "No model"
                                                           :collection_id coll-id
                                                           :database_id   (mt/id)
                                                           :dataset_query (mt/native-query {:query "select 1"})}))
                   doc-id  (t2/insert-returning-pk! :model/Document
                                                    (merge (mt/with-temp-defaults :model/Document)
                                                           {:collection_id coll-id
                                                            :creator_id    (mt/user->id :rasta)}))
                   app     (t2/insert-returning-instance! :model/DataApp {:name         "imported-app"
                                                                          :display_name "Imported app"
                                                                          :bundle_path  "app.js"})]
               (reset! ids {:collection coll-id
                            :action     act-id
                            :document   doc-id
                            :data-app   (:id app)
                            :group      (t2/select-one-fn :permission_group_id :model/DataApp :id (:id app))}))))
          (let [{:keys [collection action document data-app]} @ids]
            (testing "the collection is gone"
              (is (not (t2/exists? :model/Collection :id collection))))
            (testing "a model-less action in the collection is gone"
              (is (not (t2/exists? :model/Action :id action))))
            (testing "a document in the collection is gone"
              (is (not (t2/exists? :model/Document :id document))))
            (testing "a data app is gone"
              (is (not (t2/exists? :model/DataApp :id data-app)))))
          (finally
            (let [{:keys [action document data-app group]} @ids]
              (when action (t2/delete! :model/Action :id action))
              (when document (t2/delete! :model/Document :id document))
              (when data-app (t2/delete! :model/DataApp :id data-app))
              ;; a raw delete of the data app skips the hook that deletes its permission group
              (when group (t2/delete! :model/PermissionsGroup :id group)))))))))

(defn- remote-sync-setting-rows
  "The raw `setting` rows whose key starts with `remote-sync`, as `[key value value_with_aad]`, sorted by key."
  []
  (->> (t2/select :setting :key [:like "remote-sync%"])
       (map (juxt :key :value :value_with_aad))
       sort
       vec))

(defn- do-with-remote-sync-state-restored!
  "Runs `thunk`, then puts back the raw `remote-sync%` setting rows and the RemoteSyncObject rows that existed before
  it, and restores the settings cache."
  [thunk]
  (let [settings (t2/select :setting :key [:like "remote-sync%"])
        ledger   (t2/select :model/RemoteSyncObject)]
    (try
      (thunk)
      (finally
        (t2/delete! :setting :key [:like "remote-sync%"])
        (when (seq settings)
          (t2/insert! :setting settings))
        (setting/restore-cache!)
        (t2/delete! :model/RemoteSyncObject)
        (when (seq ledger)
          (t2/insert! :model/RemoteSyncObject ledger))))))

(defn- transforms-ledger-rows
  "The `[model_name status]` of each RemoteSyncObject row for the virtual Transforms root collection."
  []
  (t2/select-fn-vec (juxt :model_name :status) :model/RemoteSyncObject
                    :model_type "Collection"
                    :model_id   remote-sync.settings/transforms-root-id))

(defn- transforms-state
  "The stored `remote-sync-transforms` value and the Transforms ledger rows."
  []
  {:stored (t2/select-one-fn :value :model/Setting :key "remote-sync-transforms")
   :ledger (transforms-ledger-rows)})

(deftest clean-remote-sync-state-removes-stored-transforms-setting-test
  (testing (str "a remote-sync-transforms value that an earlier run stored in the app DB does not add a Transforms "
                "ledger row when the settings cache restores it inside the test")
    (do-with-remote-sync-state-restored!
     (fn []
       (#'th/remove-transforms-setting!)
       ;; store the value behind the cache's back, as an earlier JVM on a persistent app DB does
       (t2/insert! :model/Setting {:key "remote-sync-transforms" :value "true"})
       (th/clean-remote-sync-state
        (fn []
          (setting/restore-cache!)
          (is (empty? (transforms-ledger-rows)))))))))

(deftest clean-remote-sync-state-keeps-transforms-setting-and-ledger-in-step-test
  (testing "after clean-remote-sync-state, the remote-sync-transforms value and the Transforms ledger row agree when both
            existed before it"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (remote-sync.settings/remote-sync-transforms! true)
         (let [before (transforms-state)]
           (th/clean-remote-sync-state (fn []))
           (is (= before (transforms-state)))
           (is (= (remote-sync.settings/remote-sync-transforms)
                  (contains? (set (transforms-ledger-rows)) ["Transforms" "create"])))))))))

(deftest clean-remote-sync-state-keeps-existing-transforms-ledger-row-test
  (testing "a Transforms ledger row that existed before clean-remote-sync-state outlives it, because clean-object
            restores it after clean-transforms-setting deletes it"
    ;; The status "synced" shows that the row is the old row: the :on-change hook writes only "create" and "delete".
    ;; In the reverse fixture order, clean-transforms-setting deletes the row after clean-object restored it.
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (remote-sync.settings/remote-sync-transforms! true)
         (t2/update! :model/RemoteSyncObject
                     {:model_type "Collection" :model_id remote-sync.settings/transforms-root-id}
                     {:status "synced"})
         (th/clean-remote-sync-state (fn []))
         (is (= {:stored "true" :ledger [["Transforms" "synced"]]}
                (transforms-state))))))))

(deftest clean-remote-sync-state-restores-every-remote-sync-setting-row-test
  (testing "the raw remote-sync setting rows after clean-remote-sync-state equal the rows before it, also when the test
            binds settings that had no row, and changes or deletes rows with no binding"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (t2/delete! :setting :key [:in ["remote-sync-type" "remote-sync-branch" "remote-sync-auto-import"
                                         "remote-sync-git-timeout-seconds"]])
         (t2/insert! :setting [{:key "remote-sync-type" :value "read-write" :value_with_aad "read-write"}
                               ;; a row that only a version before the `value_with_aad` column wrote
                               {:key "remote-sync-branch" :value "legacy" :value_with_aad nil}])
         (setting/restore-cache!)
         (let [before (remote-sync-setting-rows)]
           (th/clean-remote-sync-state
            (fn []
              (mt/with-temporary-setting-values [remote-sync-type                :read-only
                                                 remote-sync-auto-import         true
                                                 remote-sync-git-timeout-seconds 5]
                (is (= [:read-only true 5]
                       [(remote-sync.settings/remote-sync-type)
                        (remote-sync.settings/remote-sync-auto-import)
                        (remote-sync.settings/remote-sync-git-timeout-seconds)])))
              ;; change and delete rows that existed before the test, with no binding to undo them
              (remote-sync.settings/remote-sync-type! :read-only)
              (t2/delete! :setting :key "remote-sync-branch")))
           (is (= before (remote-sync-setting-rows)))))))))

(deftest clean-remote-sync-state-keeps-setting-rows-when-the-write-back-fails-test
  (testing "when the insert of the saved remote-sync setting rows fails, the rows stay and the exception propagates"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (t2/delete! :setting :key [:in ["remote-sync-type" "remote-sync-branch" "remote-sync-transforms"]])
         (t2/insert! :setting [{:key "remote-sync-type" :value "read-write" :value_with_aad "read-write"}
                               {:key "remote-sync-branch" :value "legacy" :value_with_aad nil}])
         (setting/restore-cache!)
         (let [before  (remote-sync-setting-rows)
               insert! (mt/original-fn #'t2/insert!)]
           (is (thrown-with-msg?
                clojure.lang.ExceptionInfo #"insert failed"
                (mt/with-dynamic-fn-redefs [t2/insert! (fn [model & args]
                                                         (if (= :setting model)
                                                           (throw (ex-info "insert failed" {}))
                                                           (apply insert! model args)))]
                  (th/clean-remote-sync-state (fn [])))))
           (is (= before (remote-sync-setting-rows)))))))))

(deftest stored-transforms-setting-test-keeps-existing-transforms-state-test
  (testing "clean-remote-sync-state-removes-stored-transforms-setting-test leaves the remote-sync-transforms value and
            the Transforms ledger row that existed before it"
    (do-with-remote-sync-state-restored!
     (fn []
       (remote-sync.settings/remote-sync-transforms! true)
       (let [before (transforms-state)]
         (test-vars [#'clean-remote-sync-state-removes-stored-transforms-setting-test])
         (is (= before (transforms-state))))))))
