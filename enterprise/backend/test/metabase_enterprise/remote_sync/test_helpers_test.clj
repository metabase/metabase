(ns metabase-enterprise.remote-sync.test-helpers-test
  "Tests for test-helpers: the MockSource implementation and the clean-remote-sync-state fixture."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.parallel]
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
   [metabase.util.encryption-test :as encryption-test]
   [next.jdbc :as next.jdbc]
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
  ;; `select-fn-vec` gives nil for no row
  {:stored (t2/select-one-fn :value :model/Setting :key "remote-sync-transforms")
   :ledger (vec (transforms-ledger-rows))})

(deftest clean-remote-sync-state-removes-the-transforms-setting-and-ledger-rows-test
  (testing (str "the remote-sync-transforms value that the test sets, and the Transforms ledger row that its "
                ":on-change hook writes, do not outlive clean-remote-sync-state")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (th/clean-remote-sync-state
          (fn []
            (remote-sync.settings/remote-sync-transforms! true)
            (is (seq (transforms-ledger-rows)))))
         (is (= {:stored nil :ledger []} (transforms-state)))
         (is (false? (remote-sync.settings/remote-sync-transforms))
             "the settings cache agrees with the deleted row"))))))

(deftest clean-remote-sync-state-removes-a-stored-transforms-value-before-the-test-test
  (testing (str "a remote-sync-transforms value that an earlier run stored in the app DB does not add a Transforms "
                "ledger row when the settings cache restores it inside the test")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (t2/query-one {:delete-from :setting :where [:= :key "remote-sync-transforms"]})
         (setting/restore-cache!)
         (t2/delete! :model/RemoteSyncObject)
         ;; store the value behind the cache's back, as an earlier JVM on a persistent app DB does
         (t2/insert! :model/Setting {:key "remote-sync-transforms" :value "true"})
         (th/clean-remote-sync-state
          (fn []
            (setting/restore-cache!)
            (is (empty? (transforms-ledger-rows))))))))))

(deftest clean-remote-sync-state-deletes-every-remote-sync-setting-row-test
  (testing (str "no remote-sync setting row outlives clean-remote-sync-state, also when the test binds settings "
                "that had no row, and changes or adds rows with no binding")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
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
         (is (= [] (remote-sync-setting-rows))))))))

(deftest clean-remote-sync-settings-throws-and-names-the-keys-when-a-delete-fails-test
  (testing (str "when the delete of one remote-sync setting row fails, the other rows are deleted and the fixture "
                "throws an exception that names the failed key")
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (t2/insert! :model/Setting [{:key "remote-sync-type" :value "read-write"}
                                     {:key "remote-sync-url" :value "https://example.com/a.git"}])
         (setting/restore-cache!)
         (let [delete! (mt/original-fn #'th/delete-remote-sync-setting-row!)
               error   (try
                         (mt/with-dynamic-fn-redefs [th/delete-remote-sync-setting-row!
                                                     (fn [k]
                                                       (if (= "remote-sync-url" k)
                                                         (throw (ex-info "delete failed" {}))
                                                         (delete! k)))]
                           (th/clean-remote-sync-settings (fn [])))
                         nil
                         (catch clojure.lang.ExceptionInfo e
                           e))]
           (is (=? {:keys ["remote-sync-url"]} (ex-data error)))
           (is (re-find #"remote-sync-url" (str (ex-message error))))
           (is (= "delete failed" (ex-message (ex-cause error))))
           (testing "the other row is deleted, and the row whose delete failed stays"
             (is (= #{"remote-sync-url"} (set (map first (remote-sync-setting-rows))))))))))))

(deftest settings-cleanup-deletes-each-row-with-one-statement-outside-a-transaction-test
  (testing "the settings cleanup deletes each remote-sync row with one statement and opens no transaction"
    (do-with-remote-sync-state-restored!
     (fn []
       (t2/insert! :model/Setting [{:key "remote-sync-type" :value "read-write"}
                                   {:key "remote-sync-url" :value "https://example.com/a.git"}
                                   {:key "remote-sync-auto-import" :value "true"}])
       (let [deleted (atom [])
             delete! (mt/original-fn #'th/delete-remote-sync-setting-row!)]
         (mt/with-dynamic-fn-redefs [th/delete-remote-sync-setting-row!
                                     (fn [k]
                                       (let [counts (activity/count-db-activity! #(delete! k))]
                                         (swap! deleted conj [k (select-keys (this-thread counts)
                                                                             [:statements :transactions])])))]
           (#'th/delete-remote-sync-setting-rows!))
         (is (= [["remote-sync-auto-import" {:statements 1 :transactions 0}]
                 ["remote-sync-type" {:statements 1 :transactions 0}]
                 ["remote-sync-url" {:statements 1 :transactions 0}]]
                (sort-by first @deleted)))
         (is (= [] (remote-sync-setting-rows))))))))

(defn- sql-state-and-message
  "The SQLState and message of the innermost cause of `e`, or nil when `e` is nil."
  [^Throwable e]
  (when e
    (let [cause (last (take-while some? (iterate ex-cause e)))]
      [(when (instance? java.sql.SQLException cause) (.getSQLState ^java.sql.SQLException cause))
       (ex-message cause)])))

(defn- session-id
  "The app DB session id of the connection that the calling thread uses."
  []
  (case (mdb/db-type)
    :h2               (:id (t2/query-one ["SELECT SESSION_ID() AS id"]))
    :postgres         (:id (t2/query-one ["SELECT pg_backend_pid() AS id"]))
    (:mysql :mariadb) (:id (t2/query-one ["SELECT CONNECTION_ID() AS id"]))))

(defn- mariadb-server?
  "Whether the app DB server is MariaDB. Metabase reports the MariaDB driver as `:mysql`, and only the server
  version tells the two apart."
  []
  (str/includes? (u/lower-case-en (str (:v (t2/query-one ["SELECT VERSION() AS v"])))) "mariadb"))

(defn- session-blocks-another?
  "Whether another app DB session waits for a lock that the session `id` holds."
  [id]
  (case (mdb/db-type)
    :h2
    (pos? (:n (t2/query-one ["SELECT count(*) AS n FROM INFORMATION_SCHEMA.SESSIONS WHERE BLOCKER_ID = ?" id])))

    :postgres
    (pos? (:n (t2/query-one ["SELECT count(*) AS n FROM pg_stat_activity WHERE ? = ANY (pg_blocking_pids(pid))" id])))

    (:mysql :mariadb)
    (if (mariadb-server?)
      ;; MariaDB has no `performance_schema`; `INNODB_LOCK_WAITS` names the blocking transaction
      (pos? (:n (t2/query-one [(str "SELECT count(*) AS n FROM information_schema.INNODB_LOCK_WAITS w "
                                    "JOIN information_schema.innodb_trx b ON b.trx_mysql_thread_id = ? "
                                    "WHERE w.blocking_trx_id = b.trx_id")
                               id])))
      ;; `data_lock_waits` names the waiting and the blocking transaction, so the wait must be for a lock that the
      ;; session `id` holds, not for one that any other session on the server holds
      (pos? (:n (t2/query-one [(str "SELECT count(*) AS n FROM performance_schema.data_lock_waits w "
                                    "JOIN information_schema.innodb_trx b ON b.trx_mysql_thread_id = ? "
                                    "WHERE w.BLOCKING_ENGINE_TRANSACTION_ID = b.trx_id")
                               id]))))))

(defn- cleanup-against-a-two-row-writer!
  "Run `fixture` around a body that calls `write-two!` (it writes two rows and returns their ids `[a b]`) and then,
  in a transaction on another thread, `(lock-first! x)`; the body returns once that lock is held. The writer runs
  `(lock-second! y)` when the cleanup blocks on its lock, when the cleanup ends, or after 10 s. `[x y]` is `[a b]`
  for `order` `:a-first` and `[b a]` for `:b-first`. Returns `{:proceed :cleanup :writer :after}`: `:proceed` is
  `::cleanup-blocked` or `::cleanup-done`; `:cleanup` and `:writer` are `[sql-state message]` of an exception, or
  nil and `:committed`; `:after` is `(after! [x y])`."
  [fixture write-two! lock-first! lock-second! after! order]
  (let [writer-id (promise)
        proceed   (promise)
        writer    (atom nil)
        watcher   (atom nil)
        ids       (atom nil)
        error     (try
                    (fixture
                     (fn []
                       (let [[a b] (write-two!)
                             [x y] (reset! ids (if (= :a-first order) [a b] [b a]))]
                         (reset! writer
                                 (future
                                   (try
                                     (t2/with-transaction [_conn]
                                       (when (= :postgres (mdb/db-type))
                                         ;; bounds every wait of the writer, so that it always ends and releases its
                                         ;; locks; H2, MySQL and MariaDB detect a deadlock at once
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
          _             (deref @watcher 30000 ::timeout)]
      {:proceed @proceed
       :cleanup (sql-state-and-message error)
       :writer  (if (instance? Throwable writer-result) (sql-state-and-message writer-result) writer-result)
       :after   (some-> @ids after!)})))

(defn- delete-rows-left!
  "A function of ids that deletes the rows of `table` with those ids, one row per statement, and returns the set of
  the ids that it deleted."
  [table]
  (fn [ids]
    (let [rows-left (set (t2/select-fn-vec :id table :id [:in ids]))]
      (doseq [id rows-left]
        (t2/query-one {:delete-from table :where [:= :id id]}))
      rows-left)))

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
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (do-with-remote-sync-state-restored!
       (fn []
         (doseq [order [:a-first :b-first]]
           (testing (str "the cleanup of RemoteSyncObject, against the ledger statements of an export: delete a "
                         "departed row, then mark a written row synced; order " order)
             (is (= {:proceed ::cleanup-blocked :cleanup nil :writer :committed :after #{}}
                    (cleanup-against-a-two-row-writer!
                     th/clean-object insert-two-ledger-rows!
                     #(remote-sync.db/delete-rsos! [%])
                     #(remote-sync.db/set-rsos-status! [%] "synced" (t/offset-date-time))
                     (delete-rows-left! :remote_sync_object)
                     order))))
           (testing (str "the cleanup of RemoteSyncTask, against a transaction that updates two task rows; order "
                         order)
             (is (= {:proceed ::cleanup-blocked :cleanup nil :writer :committed :after #{}}
                    (cleanup-against-a-two-row-writer!
                     th/clean-task-table insert-two-task-rows!
                     #(remote-sync.db/update-task! % {:progress 0.5})
                     #(remote-sync.db/update-task! % {:progress 0.5})
                     (delete-rows-left! :remote_sync_task)
                     order))))))))))

(defn- set-setting-value!
  "Set the stored `value` and `value_with_aad` of the setting row `k` to `v`, with one statement."
  [k v]
  (t2/query-one {:update :setting :set {:value v :value_with_aad v} :where [:= :key k]}))

(deftest clean-remote-sync-settings-delete-of-two-rows-does-not-deadlock-test
  (testing (str "the delete of two remote-sync setting rows completes while another transaction updates the same "
                "two rows, in each order")
    (doseq [order [:a-first :b-first]]
      (testing (str "order " order)
        (do-with-remote-sync-state-restored!
         (fn []
           ;; through the model, so that the rows stay readable under an encryption key
           (t2/insert! :model/Setting [{:key "remote-sync-type" :value "read-write"}
                                       {:key "remote-sync-url" :value "https://example.com/a.git"}])
           (setting/restore-cache!)
           (is (= {:proceed ::cleanup-blocked :cleanup nil :writer :committed :after true}
                  (cleanup-against-a-two-row-writer!
                   th/clean-remote-sync-settings
                   ;; the cleanup deletes both keys. Both writer orders run, so one of them is opposite to the
                   ;; order in which a statement over both rows locks them.
                   (fn [] ["remote-sync-type" "remote-sync-url"])
                   #(set-setting-value! % "w")
                   #(set-setting-value! % "w")
                   (fn [ids] (not (some #(t2/exists? :setting :key %) ids)))
                   order)))))))))

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
  (testing (str "clean-remote-sync-state logs one warning per JVM that names what it deletes and that it restores "
                "nothing, when a started scheduler can run jobs that write the app DB during the test")
    (do-with-remote-sync-state-restored!
     (fn []
       (is (=? [{:level   :warn
                 :message #"(?s).*scheduler.*RemoteSyncObject.*remote-sync%.*Dashboard, Card, Action, Document, DataApp, Collection.*restores nothing.*"}]
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
  "Run the test vars `vs` with their namespace's fixtures. Returns their counts as `{:pass n :fail n :error n}`;
  their failures do not reach the calling test's report."
  [vs]
  (let [results (atom {:pass 0 :fail 0 :error 0})]
    (binding [*test-out*        (java.io.StringWriter.)
              *report-counters* (ref *initial-report-counters*)
              report            (fn [m]
                                  (when (#{:pass :fail :error} (:type m))
                                    (swap! results update (:type m) inc)))]
      (test-vars vs))
    @results))

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
                "existed before the test stays")
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Left over" :location "/"}]
      (mt/with-temp [:model/Card {card-id :id} (merge (mt/with-temp-defaults :model/Card)
                                                      {:name "Left over" :collection_id coll-id})]
        (th/clean-remote-sync-state (fn []))
        (is (t2/exists? :model/Collection :id coll-id))
        (is (t2/exists? :model/Card :id card-id))))))

(deftest clean-object-names-the-table-when-its-delete-after-the-test-fails-test
  (testing "clean-object throws an exception that names the table when its delete after the test fails"
    (let [delete! (mt/original-fn #'th/delete-rows-one-by-one!)
          calls   (atom 0)
          error   (try
                    (mt/with-dynamic-fn-redefs [th/delete-rows-one-by-one!
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

(defn- do-with-an-unrelated-lock-wait!
  "MySQL and MariaDB only. Calls `(thunk id)` while one app DB session waits for a lock on a scratch setting row that a
second session holds. `id` is the session id of a third session with an open transaction that holds the lock of
another scratch row, which no session waits for. Throws when the wait does not start within 4 s. Ends the wait and
the transactions, and deletes the scratch rows, before it returns."
  [thunk]
  (let [held        "t2-lock-held"
        own         "t2-lock-own"
        ds          ^javax.sql.DataSource (mdb/data-source)
        id-of       (fn [conn] (:id (next.jdbc/execute-one! conn ["SELECT CONNECTION_ID() AS id"])))
        update-row! (fn [conn k v] (next.jdbc/execute-one! conn ["UPDATE setting SET value = ? WHERE `key` = ?" v k]))]
    (t2/query-one {:delete-from :setting :where [:in :key [held own]]})
    (t2/insert! :setting [{:key held :value "0"} {:key own :value "0"}])
    (try
      (with-open [holder (.getConnection ds)
                  waiter (.getConnection ds)
                  other  (.getConnection ds)]
        (let [waiter-id (id-of waiter)
              wait      (atom nil)]
          (try
            (.setAutoCommit holder false)
            (.setAutoCommit other false)
            (update-row! holder held "holder")
            (update-row! other own "other")
            ;; so that the wait ends also when the rollback below does not run
            (next.jdbc/execute-one! waiter ["SET SESSION innodb_lock_wait_timeout = 5"])
            (reset! wait (future (try (update-row! waiter held "waiter") (catch Throwable e e))))
            (let [deadline (+ (System/currentTimeMillis) 4000)]
              (loop []
                (cond
                  (pos? (:n (t2/query-one [(str "SELECT count(*) AS n FROM information_schema.innodb_trx "
                                                "WHERE trx_state = 'LOCK WAIT' AND trx_mysql_thread_id = ?")
                                           waiter-id])))
                  nil

                  (< (System/currentTimeMillis) deadline)
                  ;; MySQL refreshes `information_schema.innodb_trx` only when it was not read in the last 100 ms
                  (do (Thread/sleep 200) (recur))

                  :else
                  (throw (ex-info "The unrelated lock wait did not start" {})))))
            (thunk (id-of other))
            (finally
              (.rollback holder)
              (.rollback other)
              (some-> @wait (deref 10000 ::timeout))
              (.setAutoCommit holder true)
              (.setAutoCommit other true)
              (next.jdbc/execute-one! waiter ["SET SESSION innodb_lock_wait_timeout = DEFAULT"])))))
      (finally
        (t2/query-one {:delete-from :setting :where [:in :key [held own]]})))))

(deftest session-blocks-another-ignores-a-lock-wait-between-other-sessions-test
  (testing (str "on MySQL and MariaDB, session-blocks-another? is false for a session with an open transaction that no "
                "session waits for, while another session waits for a lock of a third session")
    (when (#{:mysql :mariadb} (mdb/db-type))
      (do-with-an-unrelated-lock-wait!
       (fn [id]
         (is (false? (#'session-blocks-another? id))))))))

(deftest clean-remote-sync-state-setting-row-tests-pass-with-an-encryption-key-test
  (testing (str "clean-remote-sync-state-deletes-every-remote-sync-setting-row-test passes on an app DB whose "
                "settings are encrypted under MB_ENCRYPTION_SECRET_KEY")
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (encryption-test/with-secret-key "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ="
        (mdb/encrypt-db (mdb/db-type) (mdb/data-source) nil)
        (is (= {:fail 0 :error 0}
               (select-keys (run-vars-quietly [#'clean-remote-sync-state-deletes-every-remote-sync-setting-row-test])
                            [:fail :error])))))))

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
