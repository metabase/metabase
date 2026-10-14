(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for test-helpers: the MockSource implementation and the clean-remote-sync-state fixture."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.parallel]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.actions.models :as action]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.core :as lib]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  "Ids of the cards, dashboards and non-personal collections (test users' personal collections are created lazily, so
  they are left out)."
  []
  {:cards       (t2/select-pks-set :model/Card)
   :dashboards  (t2/select-pks-set :model/Dashboard)
   :collections (t2/select-pks-set :model/Collection :personal_owner_id nil)})

(defn- new-content-files
  "Files of a Collection, a Card in it and a Dashboard that shows the Card, with new entity ids, so that an import of
  them adds rows also when an earlier run left the content of [[th/create-mock-source]] in the app DB."
  []
  (let [[coll card dash dashcard] (repeatedly 4 u/generate-nano-id)
        dir                       (str "collections/" coll "_imported")]
    {(str dir "/" coll "_imported.yaml")
     (th/generate-collection-yaml coll "Imported")

     (str dir "/cards/" card "_imported_question.yaml")
     (th/generate-card-yaml card "Imported question" coll)

     (str dir "/dashboards/" dash "_imported_dashboard.yaml")
     (th/generate-dashboard-yaml dash "Imported dashboard" coll :dashcards [{:entity_id dashcard :card_id card}])}))

(deftest clean-remote-sync-state-removes-imported-content-test
  (testing "content a test imports is gone once the clean-remote-sync-state fixture ends"
    (mt/dataset test-data
      (mt/id) ; the card of the imported files references test-data
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (let [before (content-ids)]
          (th/clean-remote-sync-state
           (fn []
             (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                           :initiated_by   (mt/user->id :rasta)})
                   src     (th/create-mock-source :initial-files {"main" (new-content-files)})]
               (is (= :success (:status (impl/import! (source.p/snapshot src) task-id))))
               (testing "the import adds a card, a dashboard and a collection"
                 (is (= {:cards 1 :dashboards 1 :collections 1}
                        (into {} (for [[k ids] (content-ids)]
                                   [k (count (remove (set (get before k)) ids))]))))))))
          (is (= before (content-ids))))))))

(deftest clean-remote-sync-state-removes-collection-contents-test
  (testing "the actions, documents and data apps that a test creates are gone once the clean-remote-sync-state fixture ends"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (let [ids (atom {})]
        (try
          (th/clean-remote-sync-state
           (fn []
             (let [coll-id (t2/insert-returning-pk! :model/Collection {:name "Imported" :location "/"})
                   ;; an action without a model can only go in a Collection of the data actions namespace
                   acts-id (t2/insert-returning-pk! :model/Collection {:name      "Imported actions"
                                                                       :location  "/"
                                                                       :namespace "data-actions"})
                   ;; this action has no model, so no cascade from a deleted card removes it
                   act-id  (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                          {:type          :query
                                                           :name          "No model"
                                                           :collection_id acts-id
                                                           :database_id   (mt/id)
                                                           :dataset_query (mt/native-query {:query "select 1"})}))
                   doc-id  (t2/insert-returning-pk! :model/Document
                                                    (merge (mt/with-temp-defaults :model/Document)
                                                           {:collection_id coll-id
                                                            :creator_id    (mt/user->id :rasta)}))
                   app     (t2/insert-returning-instance! :model/DataApp {:name         "imported-app"
                                                                          :display_name "Imported app"
                                                                          :bundle_path  "app.js"})]
               (reset! ids {:collection         coll-id
                            :actions-collection acts-id
                            :action             act-id
                            :document   doc-id
                            :data-app   (:id app)
                            :group      (t2/select-one-fn :permission_group_id :model/DataApp :id (:id app))}))))
          (let [{:keys [collection actions-collection action document data-app]} @ids]
            (testing "the collections are gone"
              (is (not (t2/exists? :model/Collection :id [:in [collection actions-collection]]))))
            (testing "a model-less action in a collection is gone"
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

(defn- transforms-ledger-rows
  "The `[model_name status]` of each RemoteSyncObject row for the virtual Transforms root collection."
  []
  (t2/select-fn-vec (juxt :model_name :status) :model/RemoteSyncObject
                    :model_type "Collection"
                    :model_id   remote-sync.settings/transforms-root-id))

(defn- transforms-state
  "The stored `remote-sync-transforms` value and the Transforms ledger rows."
  []
  ;; `select-fn-vec` gives nil for no row
  {:stored (t2/select-one-fn :value :model/Setting :key "remote-sync-transforms")
   :ledger (vec (transforms-ledger-rows))})

(deftest clean-remote-sync-state-removes-the-transforms-setting-and-ledger-rows-test
  (testing (str "the remote-sync-transforms value that the test sets, and the Transforms ledger row that its "
                ":on-change hook writes, do not outlive clean-remote-sync-state")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (th/clean-remote-sync-state
       (fn []
         (remote-sync.settings/remote-sync-transforms! true)
         (is (seq (transforms-ledger-rows)))))
      (is (= {:stored nil :ledger []} (transforms-state)))
      (is (false? (remote-sync.settings/remote-sync-transforms))
          "the settings cache agrees with the deleted row"))))

(deftest clean-remote-sync-state-removes-a-stored-transforms-value-before-the-test-test
  (testing (str "a remote-sync-transforms value that an earlier run stored in the app DB does not add a Transforms "
                "ledger row when the settings cache restores it inside the test")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (t2/query-one {:delete-from :setting :where [:= :key "remote-sync-transforms"]})
      (setting/restore-cache!)
      (t2/delete! :model/RemoteSyncObject)
      ;; store the value behind the cache's back, as an earlier JVM on a persistent app DB does
      (t2/insert! :model/Setting {:key "remote-sync-transforms" :value "true"})
      (th/clean-remote-sync-state
       (fn []
         (setting/restore-cache!)
         (is (empty? (transforms-ledger-rows))))))))

(deftest clean-remote-sync-state-deletes-every-remote-sync-setting-row-test
  (testing (str "no remote-sync setting row outlives clean-remote-sync-state, also when the test binds settings "
                "that had no row, and changes or adds rows with no binding")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (th/clean-remote-sync-state
       (fn []
         ;; through the model, so that the rows stay readable under an encryption key
         (t2/insert! :model/Setting [{:key "remote-sync-type" :value "read-write"}
                                     {:key "remote-sync-url" :value "https://example.com/a.git"}])
         (setting/restore-cache!)
         (is (seq (remote-sync-setting-rows)))
         (mt/with-temporary-setting-values [remote-sync-type                :read-only
                                            remote-sync-auto-import         true
                                            remote-sync-git-timeout-seconds 5]
           (is (= [:read-only true 5]
                  [(remote-sync.settings/remote-sync-type)
                   (remote-sync.settings/remote-sync-auto-import)
                   (remote-sync.settings/remote-sync-git-timeout-seconds)])))
         ;; change a row and add one, with no binding to undo them
         (remote-sync.settings/remote-sync-type! :read-only)
         (t2/insert! :model/Setting {:key "remote-sync-branch" :value "main"})))
      (is (= [] (remote-sync-setting-rows))))))

(defn- raw-rows
  "Every row of `table`, every column as stored, sorted by id."
  [table]
  (->> (t2/select table) (map #(into {} %)) (sort-by :id) vec))

(deftest clean-object-and-clean-task-table-delete-every-row-test
  (testing (str "clean-object and clean-task-table empty their table before the test, and no row that the test "
                "added outlives them")
    (let [user (mt/user->id :rasta)]
      (doseq [[fixture table row test-row]
              [[th/clean-task-table :remote_sync_task
                {:sync_task_type "import" :initiated_by user}
                {:sync_task_type "export" :initiated_by user}]
               [th/clean-object :remote_sync_object
                {:model_type "Card" :model_id 7 :model_name "Old" :status "synced"
                 :status_changed_at (t/offset-date-time)}
                {:model_type "Card" :model_id 8 :model_name "New" :status "create"
                 :status_changed_at (t/offset-date-time)}]]]
        (testing table
          ;; a row from before the fixture: the before-test delete of the fixture removes it
          (t2/insert! table row)
          (fixture (fn []
                     (is (empty? (raw-rows table)) "the fixture empties the table for the test")
                     (t2/insert! table test-row)))
          (is (empty? (raw-rows table))))))))

(deftest clean-remote-sync-state-does-not-reindex-when-the-test-writes-no-content-test
  (testing "clean-remote-sync-state around a test that writes no content does not reindex search"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [search/reindex! (fn [& _] (swap! calls inc) nil)]
        (th/clean-remote-sync-state (fn [])))
      (is (zero? @calls)))))

(deftest clean-imported-content-reindexes-when-the-test-writes-content-test
  (testing "clean-imported-content reindexes search once after a test that leaves new content or its index document"
    (let [calls     (atom 0)
          reindexes (fn [body]
                      (reset! calls 0)
                      (mt/with-dynamic-fn-redefs [search/reindex! (fn [& _] (swap! calls inc) nil)]
                        (th/clean-imported-content body))
                      @calls)]
      (testing "the test leaves a new Collection"
        (is (= 1 (reindexes #(t2/insert! :model/Collection {:name "New" :location "/"})))))
      (when (search.index/active-table)
        (testing "the test deletes its new Collection, and the index keeps the Collection's document"
          (is (= 1 (reindexes #(t2/delete! :model/Collection
                                           (t2/insert-returning-pk! :model/Collection {:name "New" :location "/"}))))))
        ;; the stubbed reindexes left the documents of the deleted Collections in the index
        (#'tu/reindex-search-index!)))))

;;; ------------------------------------------------ the shared fixture deletes rows from before the test ------------------------------------------------

(defn- do-with-row-from-before!
  "Run `(thunk)` with one row of the table that `kind` names in the app DB, and no row of it afterwards."
  [kind thunk]
  (case kind
    :ledger
    (mt/with-temp [:model/RemoteSyncObject {_ :id}
                   {:model_type "Card" :model_id 7 :model_name "Left over" :status "synced"
                    :status_changed_at (t/offset-date-time)}]
      (thunk))

    :task
    (mt/with-temp [:model/RemoteSyncTask {_ :id}
                   {:sync_task_type "import" :initiated_by (mt/user->id :rasta)}]
      (thunk))

    :setting
    (do
      (t2/insert! :model/Setting {:key "remote-sync-branch" :value "main"})
      (try
        (thunk)
        (finally
          (t2/delete! :setting :key "remote-sync-branch")
          (setting/restore-cache!))))

    :transform
    (mt/with-premium-features #{:transforms :transforms-python}
      (mt/with-temp [:model/Transform {_ :id}
                     {:name        "Left over"
                      :source      {:type "query" :query (mt/native-query {:query "SELECT 1"})}
                      :target      {:type "table" :schema "PUBLIC" :name "left_over"}}]
        (thunk)))

    :tag
    (mt/with-temp [:model/TransformTag {_ :id} {:name "Left over"}]
      (thunk))

    :python-library
    (mt/with-temp [:model/PythonLibrary {_ :id} {:path "left_over.py" :source ""}]
      (thunk))

    :namespace-collection
    (mt/with-temp [:model/Collection {_ :id} {:name "Left over transforms" :location "/" :namespace "transforms"}]
      (thunk))))

(defn- dirty-row-exists?
  "Whether the row that [[do-with-row-from-before!]] made for `kind` is in the app DB."
  [kind]
  (case kind
    :ledger              (pos? (t2/count :model/RemoteSyncObject :model_name "Left over"))
    :task                (pos? (t2/count :model/RemoteSyncTask :sync_task_type "import"))
    :setting             (t2/exists? :setting :key "remote-sync-branch")
    :transform           (pos? (t2/count :model/Transform :name "Left over"))
    :tag                 (t2/exists? :model/TransformTag :name "Left over")
    :python-library      (t2/exists? :model/PythonLibrary :path "left_over.py")
    :namespace-collection (t2/exists? :model/Collection :name "Left over transforms")))

(deftest clean-remote-sync-state-deletes-the-remote-sync-rows-from-before-the-test-test
  (testing (str "clean-remote-sync-state deletes a row that existed before the test before the test runs, in each "
                "table that the fixture cleans, and the row does not come back after the test")
    (doseq [kind [:ledger :task :setting :transform :tag :python-library :namespace-collection]]
      (testing kind
        (do-with-row-from-before!
         kind
         (fn []
           (is (dirty-row-exists? kind))
           (th/clean-remote-sync-state
            (fn []
              (is (not (dirty-row-exists? kind)) "the test does not see the row")))
           (is (not (dirty-row-exists? kind)))))))))

(deftest clean-remote-sync-state-keeps-the-content-rows-from-before-the-test-test
  (testing (str "the content cleanup deletes only rows above the id that it saved at the start, so content that "
                "existed before the test, and that the test linked to no new row, stays")
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Left over" :location "/"}]
      (mt/with-temp [:model/Card {card-id :id} (merge (mt/with-temp-defaults :model/Card)
                                                      {:name "Left over" :collection_id coll-id})]
        (th/clean-remote-sync-state (fn []))
        (is (t2/exists? :model/Collection :id coll-id))
        (is (t2/exists? :model/Card :id card-id))))))

(deftest clean-remote-sync-state-changes-or-deletes-the-older-rows-that-link-to-new-content-test
  (testing (str "the foreign keys of the content that the cleanup deletes change or delete the rows from before the "
                "test that the test linked to it, as the clean-imported-content docstring says")
    (mt/with-temp [:model/Collection    {child-id :id} {:name "Old child" :location "/"}
                   :model/Timeline      {tl-id :id}    {:name "Old timeline"}
                   :model/Card          {card-id :id}  {:name "Old card"}
                   :model/Dashboard     {dash-id :id}  {:name "Old dashboard"}
                   :model/DashboardCard {dc-id :id}    {:dashboard_id dash-id :card_id card-id}]
      (let [new-coll (volatile! nil)]
        (th/clean-remote-sync-state-without-reindex
         (fn []
           (let [coll-id  (t2/insert-returning-pk! :model/Collection {:name "New" :location "/"})
                 new-card (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                                      {:name "New card"}))]
             (vreset! new-coll coll-id)
             ;; raw updates: no model hook moves the rows back or checks the move
             (t2/query-one {:update :timeline :set {:collection_id coll-id} :where [:= :id tl-id]})
             (t2/query-one {:update :report_card :set {:collection_id coll-id} :where [:= :id card-id]})
             (t2/query-one {:update :report_dashboard :set {:collection_id coll-id} :where [:= :id dash-id]})
             (t2/query-one {:update :collection :set {:location (str "/" coll-id "/")} :where [:= :id child-id]})
             (t2/query-one {:update :report_dashboardcard :set {:card_id new-card} :where [:= :id dc-id]}))))
        (testing "an old Timeline in a new Collection is deleted"
          (is (not (t2/exists? :model/Timeline :id tl-id))))
        (testing "an old dashcard that shows a new Card is deleted"
          (is (not (t2/exists? :model/DashboardCard :id dc-id))))
        (testing "an old Card and an old Dashboard in a new Collection get collection_id NULL"
          (is (= [nil nil]
                 [(t2/select-one-fn :collection_id :report_card :id card-id)
                  (t2/select-one-fn :collection_id :report_dashboard :id dash-id)])))
        (testing "an old Collection under a new Collection keeps a location that names the deleted Collection"
          (is (= (str "/" @new-coll "/")
                 (t2/select-one-fn :location :collection :id child-id))))))))

(deftest clean-remote-sync-state-deletes-the-snippets-in-a-snippets-collection-test
  (testing (str "clean-remote-sync-state deletes a Collection of the snippets namespace from before the test, and the "
                "snippets in it")
    (mt/with-temp [:model/Collection         {coll-id :id} {:name "Old snippets" :location "/" :namespace "snippets"}
                   :model/NativeQuerySnippet {sn-id :id}   {:name          (mt/random-name)
                                                            :content       "1"
                                                            :collection_id coll-id}]
      (th/clean-remote-sync-state-without-reindex (fn []))
      (is (not (t2/exists? :model/Collection :id coll-id)))
      (is (not (t2/exists? :model/NativeQuerySnippet :id sn-id))))))

(deftest clean-object-names-the-table-when-its-delete-after-the-test-fails-test
  (testing "clean-object throws an exception that names the table when its delete after the test fails"
    (let [delete! (mt/original-fn #'th/delete-every-row!)
          calls   (atom 0)
          error   (try
                    (mt/with-dynamic-fn-redefs [th/delete-every-row!
                                                (fn [table]
                                                  ;; the first call empties the table for the test
                                                  (if (= 2 (swap! calls inc))
                                                    (throw (ex-info "delete failed" {}))
                                                    (delete! table)))]
                      (th/clean-object (fn [])))
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
      (is (= :remote_sync_object (:table (ex-data error))))
      (is (str/includes? (ex-message error) "remote_sync_object")))))

(deftest clean-imported-content-throws-without-running-the-test-in-a-parallel-test-test
  (testing "clean-imported-content in a ^:parallel test throws and does not run the test body"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (let [ran?   (atom false)
            ;; hawk reports the error of the parallel check through `is`; keep it out of this test's report
            thrown (binding [mb.hawk.parallel/*parallel?* true
                             report                       (fn [_])]
                     (try
                       (th/clean-imported-content (fn [] (reset! ran? true)))
                       nil
                       (catch Throwable e
                         e)))]
        (is (some? thrown))
        (is (false? @ran?))))))
