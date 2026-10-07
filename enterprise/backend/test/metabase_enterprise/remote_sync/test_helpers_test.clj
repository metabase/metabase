(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for test-helpers: the MockSource implementation and the clean-remote-sync-state fixture."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.actions.models :as action]
   [metabase.actions.schema :as actions.schema]
   [metabase.app-db.activity-test-util :as activity]
   [metabase.app-db.core :as mdb]
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
        ;; one autocommit statement for each row, so that the restore holds the lock of one setting row at a time
        (doseq [k (t2/select-fn-set :key :setting :key [:like "remote-sync%"])]
          (t2/query-one {:delete-from :setting :where [:= :key k]}))
        (doseq [row settings]
          (t2/query-one {:insert-into :setting :values [row]}))
        (setting/restore-cache!)
        (t2/delete! :model/RemoteSyncObject)
        (when (seq ledger)
          (t2/insert! :model/RemoteSyncObject ledger))))))

(defn- this-thread
  "The counts of the calling thread in the [[activity/count-db-activity!]] result `counts`."
  [counts]
  (get-in counts [:by-thread (.threadId (Thread/currentThread))] (zipmap activity/count-keys (repeat 0))))

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
         ;; so that the setter changes the value and its :on-change hook writes the Transforms ledger row
         (#'th/remove-transforms-setting!)
         (remote-sync.settings/remote-sync-transforms! true)
         (let [before (transforms-state)]
           (th/clean-remote-sync-state (fn []))
           (is (= before (transforms-state)))
           (is (= (remote-sync.settings/remote-sync-transforms)
                  (contains? (set (transforms-ledger-rows)) ["Transforms" "create"])))))))))

(deftest clean-remote-sync-state-keeps-existing-transforms-ledger-row-test
  (testing "a Transforms ledger row that existed before clean-remote-sync-state outlives it, because clean-object
            restores it after clean-remote-sync-settings deletes it"
    ;; The status "synced" shows that the row is the old row: the :on-change hook writes only "create" and "delete".
    ;; In the reverse fixture order, clean-remote-sync-settings deletes the row after clean-object restored it.
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         ;; so that the setter changes the value and its :on-change hook writes the Transforms ledger row
         (#'th/remove-transforms-setting!)
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

(deftest clean-remote-sync-state-writes-back-the-other-setting-rows-when-the-write-of-one-fails-test
  (testing "when the write-back of one remote-sync setting row fails, the other rows are written back and the fixture
            throws an exception that names the failed key"
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (t2/delete! :setting :key [:in ["remote-sync-type" "remote-sync-branch" "remote-sync-transforms"]])
         (t2/insert! :setting [{:key "remote-sync-type" :value "read-write" :value_with_aad "read-write"}
                               {:key "remote-sync-branch" :value "legacy" :value_with_aad nil}])
         (setting/restore-cache!)
         (let [write! (mt/original-fn #'th/write-remote-sync-setting-row!)
               error  (try
                        (mt/with-dynamic-fn-redefs [th/write-remote-sync-setting-row!
                                                    (fn [k & args]
                                                      (if (= "remote-sync-branch" k)
                                                        (throw (ex-info "write failed" {}))
                                                        (apply write! k args)))]
                          (th/clean-remote-sync-state
                           (fn []
                             (t2/update! :setting :key "remote-sync-type" {:value "read-only" :value_with_aad "read-only"})
                             (t2/delete! :setting :key "remote-sync-branch"))))
                        nil
                        (catch clojure.lang.ExceptionInfo e
                          e))]
           (is (=? {:keys ["remote-sync-branch"]} (ex-data error)))
           (is (re-find #"remote-sync-branch" (str (ex-message error))))
           (is (= "write failed" (ex-message (ex-cause error))))
           (testing "the update of the other key is written back, and the deleted row is not"
             (is (= [["remote-sync-type" "read-write" "read-write"]]
                    (filter (comp #{"remote-sync-type" "remote-sync-branch"} first) (remote-sync-setting-rows)))))))))))

(deftest write-back-writes-only-changed-keys-each-with-one-statement-outside-a-transaction-test
  (testing "the write-back writes each changed key with one statement, opens no transaction, and leaves unchanged keys"
    (do-with-remote-sync-state-restored!
     (fn []
       (t2/delete! :setting :key [:like "remote-sync%"])
       (let [saved   [{:key "remote-sync-type" :value "read-write" :value_with_aad "read-write"}
                      {:key "remote-sync-url" :value "https://example.com/a.git" :value_with_aad "https://example.com/a.git"}
                      {:key "remote-sync-auto-import" :value "true" :value_with_aad "true"}]
             written (atom [])
             write!  (mt/original-fn #'th/write-remote-sync-setting-row!)]
         (t2/insert! :setting saved)
         ;; a changed key, a deleted key, a new key, and an unchanged key (remote-sync-auto-import)
         (t2/update! :setting :key "remote-sync-type" {:value "read-only" :value_with_aad "read-only"})
         (t2/delete! :setting :key "remote-sync-url")
         (t2/insert! :setting {:key "remote-sync-branch" :value "main" :value_with_aad "main"})
         (mt/with-dynamic-fn-redefs [th/write-remote-sync-setting-row!
                                     (fn [k & args]
                                       (let [counts (activity/count-db-activity! #(apply write! k args))]
                                         (swap! written conj [k (select-keys (this-thread counts)
                                                                             [:statements :transactions])])))]
           (#'th/write-remote-sync-setting-rows! saved))
         (is (= [["remote-sync-branch" {:statements 1 :transactions 0}]
                 ["remote-sync-type" {:statements 1 :transactions 0}]
                 ["remote-sync-url" {:statements 1 :transactions 0}]]
                (sort-by first @written)))
         (is (= (sort (map (juxt :key :value :value_with_aad) saved))
                (remote-sync-setting-rows))))))))

(deftest stored-transforms-setting-test-keeps-existing-transforms-state-test
  (testing "clean-remote-sync-state-removes-stored-transforms-setting-test leaves the remote-sync-transforms value and
            the Transforms ledger row that existed before it"
    (do-with-remote-sync-state-restored!
     (fn []
       (remote-sync.settings/remote-sync-transforms! true)
       (let [before (transforms-state)]
         (test-vars [#'clean-remote-sync-state-removes-stored-transforms-setting-test])
         (is (= before (transforms-state))))))))

(defn- sql-state-and-message
  "The SQLState and message of the innermost cause of `e`, or nil when `e` is nil."
  [^Throwable e]
  (when e
    (let [cause (last (take-while some? (iterate ex-cause e)))]
      [(when (instance? java.sql.SQLException cause) (.getSQLState ^java.sql.SQLException cause))
       (ex-message cause)])))

(defn- write-back-against-a-two-row-writer!
  "Store two remote-sync setting rows, and run `clean-remote-sync-settings` around a body that changes both rows. While
  the write-back runs, a transaction on another thread updates `writer-first`, waits until the write-back waits for
  it, then updates `writer-second`. Returns `{:proceed :write-back :writer :writer-first}`."
  [writer-first writer-second]
  (t2/delete! :setting :key [:like "remote-sync%"])
  (t2/insert! :setting [{:key "remote-sync-type" :value "read-write" :value_with_aad "read-write"}
                        {:key "remote-sync-url" :value "https://example.com/a.git" :value_with_aad "https://example.com/a.git"}])
  (setting/restore-cache!)
  (let [saved      (into {} (map (juxt first second)) (remote-sync-setting-rows))
        set-value! (fn [k v] (t2/query-one {:update :setting :set {:value v :value_with_aad v} :where [:= :key k]}))
        writer-pid (promise)
        proceed    (promise)
        writer     (atom nil)
        watcher    (atom nil)
        error      (try
                     (th/clean-remote-sync-settings
                      (fn []
                        ;; the test changes both rows, so the write-back must write both keys. An update moves the
                        ;; row, so this order sets the scan order of a statement over both rows; it is the same for
                        ;; both writer orders, so one writer order is opposite to the scan order.
                        (set-value! "remote-sync-type" "t")
                        (set-value! "remote-sync-url" "t")
                        (reset! writer
                                (future
                                  (try
                                    (t2/with-transaction [_conn]
                                      ;; bounds every wait of the writer, so that it always ends and releases its locks
                                      (t2/query-one ["SET LOCAL lock_timeout = '20s'"])
                                      (set-value! writer-first "w")
                                      (deliver writer-pid (:pid (t2/query-one ["SELECT pg_backend_pid() AS pid"])))
                                      (deref proceed 10000 ::timeout)
                                      (set-value! writer-second "w"))
                                    :committed
                                    (catch Throwable e e)
                                    (finally
                                      (deliver writer-pid nil)))))
                        (let [pid (deref writer-pid 10000 ::timeout)]
                          (reset! watcher
                                  (future
                                    (let [deadline (+ (System/currentTimeMillis) 10000)]
                                      (loop []
                                        (cond
                                          (realized? proceed)
                                          nil

                                          (pos? (:n (t2/query-one ["SELECT count(*) AS n FROM pg_stat_activity
                                                                    WHERE ? = ANY (pg_blocking_pids(pid))" pid])))
                                          (deliver proceed ::write-back-blocked)

                                          (< (System/currentTimeMillis) deadline)
                                          (do (Thread/sleep 20) (recur))))))))))
                     nil
                     (catch Throwable e e))]
    (deliver proceed ::write-back-done)
    (let [writer-result (deref @writer 30000 ::timeout)
          _             (deref @watcher 30000 ::timeout)
          after         (into {} (map (juxt first second)) (remote-sync-setting-rows))]
      {:proceed      @proceed
       :write-back   (sql-state-and-message error)
       :writer       (if (instance? Throwable writer-result) (sql-state-and-message writer-result) writer-result)
       ;; the write-back waited for the writer's lock on this row, so it wrote the saved value after the writer
       :writer-first (= (get saved writer-first) (get after writer-first))})))

(deftest clean-remote-sync-settings-write-back-of-two-changed-rows-does-not-deadlock-test
  (testing (str "the write-back of two changed remote-sync rows completes while another transaction updates the same "
                "two rows, in each order")
    (when (= :postgres (mdb/db-type))
      (doseq [[a b] [["remote-sync-type" "remote-sync-url"] ["remote-sync-url" "remote-sync-type"]]]
        (testing (str "the other transaction updates " a ", then " b)
          (do-with-remote-sync-state-restored!
           (fn []
             (is (= {:proceed      ::write-back-blocked
                     :write-back   nil
                     :writer       :committed
                     :writer-first true}
                    (write-back-against-a-two-row-writer! a b))))))))))

(defn- session-id
  "The app DB session id of the connection that the calling thread uses."
  []
  (case (mdb/db-type)
    :postgres         (:id (t2/query-one ["SELECT pg_backend_pid() AS id"]))
    (:mysql :mariadb) (:id (t2/query-one ["SELECT CONNECTION_ID() AS id"]))))

(defn- session-blocks-another?
  "Whether another app DB session waits for a lock. On Postgres, the lock must be one that the session `id` holds; on
  MySQL and MariaDB, the session `id` must have an open transaction."
  [id]
  (case (mdb/db-type)
    :postgres
    (pos? (:n (t2/query-one ["SELECT count(*) AS n FROM pg_stat_activity WHERE ? = ANY (pg_blocking_pids(pid))" id])))

    (:mysql :mariadb)
    (pos? (:n (t2/query-one [(str "SELECT count(*) AS n FROM information_schema.innodb_trx w "
                                  "JOIN information_schema.innodb_trx b ON b.trx_mysql_thread_id = ? "
                                  "WHERE w.trx_state = 'LOCK WAIT' AND w.trx_mysql_thread_id <> ?")
                             id id])))))

(defn- cleanup-against-a-two-row-writer!
  "Run the cleanup fixture `fixture` around a body that inserts two rows with `insert-two!`, which returns their ids
  `[a b]`. While the cleanup runs, a transaction on another thread runs `(lock-first! x)`, waits until the cleanup
  waits for it, then runs `(lock-second! y)`; `[x y]` is `[a b]` for `order` `:a-first` and `[b a]` for `:b-first`.
  Deletes the two rows after the fixture. Returns `{:proceed :cleanup :writer :rows-left}`."
  [fixture table insert-two! lock-first! lock-second! order]
  (let [writer-id (promise)
        proceed   (promise)
        writer    (atom nil)
        watcher   (atom nil)
        ids       (atom nil)
        error     (try
                    (fixture
                     (fn []
                       (let [[a b] (reset! ids (insert-two!))
                             [x y] (if (= :a-first order) [a b] [b a])]
                         (reset! writer
                                 (future
                                   (try
                                     (t2/with-transaction [_conn]
                                       (when (= :postgres (mdb/db-type))
                                         ;; bounds every wait of the writer, so that it always ends and releases its
                                         ;; locks; MySQL and MariaDB detect a deadlock at once
                                         (t2/query-one ["SET LOCAL lock_timeout = '20s'"]))
                                       (lock-first! x)
                                       (deliver writer-id (session-id))
                                       (deref proceed 10000 ::timeout)
                                       (lock-second! y))
                                     :committed
                                     (catch Throwable e e)
                                     (finally
                                       (deliver writer-id nil)))))
                         (let [id (deref writer-id 10000 ::timeout)]
                           (reset! watcher
                                   (future
                                     (let [deadline (+ (System/currentTimeMillis) 10000)]
                                       (loop []
                                         (cond
                                           (realized? proceed)
                                           nil

                                           (session-blocks-another? id)
                                           (deliver proceed ::cleanup-blocked)

                                           (< (System/currentTimeMillis) deadline)
                                           ;; MySQL refreshes `information_schema.innodb_trx` only when it was not
                                           ;; read in the last 100 ms
                                           (do (Thread/sleep 200) (recur)))))))))))
                    nil
                    (catch Throwable e e))]
    (deliver proceed ::cleanup-done)
    (let [writer-result (deref @writer 30000 ::timeout)
          _             (deref @watcher 30000 ::timeout)
          rows-left     (set (t2/select-fn-vec :id table :id [:in @ids]))]
      (doseq [id rows-left]
        (t2/query-one {:delete-from table :where [:= :id id]}))
      {:proceed   @proceed
       :cleanup   (sql-state-and-message error)
       :writer    (if (instance? Throwable writer-result) (sql-state-and-message writer-result) writer-result)
       :rows-left rows-left})))

(defn- insert-two-ledger-rows!
  "Insert two RemoteSyncObject rows. Returns their ids."
  []
  (let [now (t/offset-date-time)]
    (mapv #(t2/insert-returning-pk! :model/RemoteSyncObject {:model_type        "Card"
                                                             :model_id          %
                                                             :model_name        "Card"
                                                             :status            "update"
                                                             :status_changed_at now})
          [Integer/MAX_VALUE (dec Integer/MAX_VALUE)])))

(defn- insert-two-task-rows!
  "Insert two RemoteSyncTask rows, one of them ended. Returns their ids."
  []
  [(t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                   :initiated_by   (mt/user->id :rasta)
                                                   :ended_at       (t/offset-date-time)})
   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                   :initiated_by   (mt/user->id :rasta)})])

(deftest clean-object-and-clean-task-table-do-not-deadlock-with-a-two-row-writer-test
  (testing (str "the cleanups of the RemoteSyncObject and RemoteSyncTask tables complete while another transaction "
                "locks two rows of the table in two statements, in each order")
    (when (#{:postgres :mysql :mariadb} (mdb/db-type))
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (do-with-remote-sync-state-restored!
         (fn []
           (doseq [order [:a-first :b-first]]
             (testing (str "the cleanup of RemoteSyncObject, against the ledger statements of an export: delete a "
                           "departed row, then mark a written row synced; order " order)
               (is (= {:proceed ::cleanup-blocked :cleanup nil :writer :committed :rows-left #{}}
                      (cleanup-against-a-two-row-writer!
                       th/clean-object :remote_sync_object insert-two-ledger-rows!
                       #(remote-sync.db/delete-rsos! [%])
                       #(remote-sync.db/set-rsos-status! [%] "synced" (t/offset-date-time))
                       order))))
             (testing (str "the cleanup of RemoteSyncTask, against a transaction that updates two task rows; order "
                           order)
               (is (= {:proceed ::cleanup-blocked :cleanup nil :writer :committed :rows-left #{}}
                      (cleanup-against-a-two-row-writer!
                       th/clean-task-table :remote_sync_task insert-two-task-rows!
                       #(remote-sync.db/update-task! % {:progress 0.5})
                       #(remote-sync.db/update-task! % {:progress 0.5})
                       order)))))))))))

(deftest clean-remote-sync-state-does-not-reindex-when-the-test-writes-no-content-test
  (testing "clean-remote-sync-state around a test that writes no content does not reindex search"
    (do-with-remote-sync-state-restored!
     (fn []
       (let [calls (atom 0)]
         (mt/with-dynamic-fn-redefs [search/reindex! (fn [& _] (swap! calls inc) nil)]
           (th/clean-remote-sync-state (fn [])))
         (is (zero? @calls)))))))

(deftest clean-imported-content-reindexes-when-the-test-writes-content-test
  (testing "clean-imported-content reindexes search once after a test that leaves new content or its index document"
    (do-with-remote-sync-state-restored!
     (fn []
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
           (#'tu/reindex-search-index!)))))))

(defn- shared-fixture-warnings
  "Run `thunk` with the once-per-JVM warning of the shared fixture not yet logged. Returns the WARN messages of the
  test-helpers namespace that `thunk` logs, then puts back the logged state from before."
  [thunk]
  (let [logged? @#'th/another-writer-warning-logged?
        before  @logged?]
    (try
      (reset! logged? false)
      (mt/with-log-messages-for-level [messages [metabase-enterprise.remote-sync.test-helpers :warn]]
        (thunk)
        (messages))
      (finally
        (reset! logged? before)))))

(deftest clean-remote-sync-state-warns-once-when-a-started-scheduler-can-write-test
  (testing (str "clean-remote-sync-state logs one warning per JVM that names what it deletes and writes back, when a "
                "started scheduler can run jobs that write the app DB during the test")
    (do-with-remote-sync-state-restored!
     (fn []
       (is (=? [{:level   :warn
                 :message #"(?s)scheduler.*Dashboard, Card, Action, Document, DataApp, Collection.*remote-sync%"}]
               (shared-fixture-warnings
                (fn []
                  (mt/with-temp-scheduler!
                    (th/clean-remote-sync-state (fn []))
                    (th/clean-remote-sync-state (fn [])))))))))))

(deftest clean-remote-sync-state-does-not-warn-when-no-started-scheduler-can-write-test
  (testing "clean-remote-sync-state logs no warning when the scheduler is not started"
    (do-with-remote-sync-state-restored!
     (fn []
       (is (= []
              (shared-fixture-warnings
               (fn []
                 (tu/do-with-unstarted-temp-scheduler!
                  (fn []
                    (th/clean-remote-sync-state (fn []))))))))
       (testing "and a later fixture run with a started scheduler still warns"
         (is (=? [{:level :warn}]
                 (shared-fixture-warnings
                  (fn []
                    (tu/do-with-unstarted-temp-scheduler!
                     (fn []
                       (th/clean-remote-sync-state (fn []))))
                    (mt/with-temp-scheduler!
                      (th/clean-remote-sync-state (fn []))))))))))))

(defn- run-vars-quietly
  "Run the test vars `vs` with their namespace's `:each` fixtures. Returns their counts as `{:pass n :fail n :error n}`;
  their failures are not reported to the calling test."
  [vs]
  (let [results (atom {:pass 0 :fail 0 :error 0})]
    (binding [*test-out*        (java.io.StringWriter.)
              *report-counters* (ref *initial-report-counters*)
              report            (fn [m]
                                  (when (#{:pass :fail :error} (:type m))
                                    (swap! results update (:type m) inc)))]
      (test-vars vs))
    @results))

(deftest clean-remote-sync-state-transforms-tests-pass-when-transforms-is-already-stored-test
  (testing (str "the tests that keep the Transforms ledger row and the remote-sync-transforms value in step pass when "
                "the app DB already stores remote-sync-transforms as true")
    (do-with-remote-sync-state-restored!
     (fn []
       (#'th/remove-transforms-setting!)
       ;; store the value behind the cache's back, as an earlier JVM on a persistent app DB does
       (t2/insert! :setting {:key "remote-sync-transforms" :value "true" :value_with_aad "true"})
       (setting/restore-cache!)
       (#'th/delete-transforms-ledger-rows!)
       (is (= {:fail 0 :error 0}
              (select-keys (run-vars-quietly [#'clean-remote-sync-state-keeps-existing-transforms-ledger-row-test
                                              #'clean-remote-sync-state-keeps-transforms-setting-and-ledger-in-step-test])
                           [:fail :error])))))))
