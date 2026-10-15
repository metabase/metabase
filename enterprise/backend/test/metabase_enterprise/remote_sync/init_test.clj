(ns metabase-enterprise.remote-sync.init-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.events :as rs-events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.init :as init]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase-enterprise.transforms-python.core :as transforms-python]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each th/clean-remote-sync-state)

(defn- capture-async-import! []
  (let [calls (atom [])]
    [calls (fn [branch force? args & _opts] (swap! calls conj [branch force? args]) nil)]))

(deftest remote-sync-init-disabled-with-remote-synced-collection-clears-test
  (testing "When remote sync is disabled, existing remote-synced collections are cleared"
    (mt/with-temporary-setting-values [:remote-sync-url nil
                                       :remote-sync-type nil
                                       :remote-sync-branch nil]
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
        (is (true? (collection/has-remote-synced-collection?)))
        (#'init/remote-sync-init)
        (is (false? (collection/has-remote-synced-collection?)))))))

(deftest remote-sync-init-disabled-without-remote-synced-collection-is-noop-test
  (testing "When remote sync is disabled and no remote-synced collection exists, nothing happens"
    (mt/with-temporary-setting-values [:remote-sync-url nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [impl/async-import! capture]
          (#'init/remote-sync-init)
          (is (empty? @calls)))))))

(deftest remote-sync-init-read-only-without-branch-throws-test
  (testing "Read-only with enabled sync but no branch throws"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch nil]
      (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"no branch is set"
                              (#'init/remote-sync-init)))))))

(deftest remote-sync-init-read-only-dirty-without-allow-throws-test
  (testing "Read-only with dirty unpublished changes throws unless override is set"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-allow nil]
      (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly true)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"unpublished changes"
                              (#'init/remote-sync-init)))))))

(deftest remote-sync-init-read-only-dirty-with-allow-imports-test
  (testing "Read-only with dirty unpublished changes plus overwrite-unpublished override triggers import"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-allow "overwrite-unpublished"]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly true)
                                    impl/async-import! capture]
          (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
            (#'init/remote-sync-init)
            (is (= [["main" true {}]] @calls))))))))

(deftest remote-sync-init-no-remote-synced-collection-imports-test
  (testing "When remote sync is enabled but no remote-synced collection exists, import is triggered"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "develop"
                                       :remote-sync-allow nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          ;; Make sure no remote-synced collection exists for the test
          (collection/clear-remote-synced-collection!)
          (#'init/remote-sync-init)
          (is (= [["develop" true {}]] @calls)))))))

(deftest remote-sync-init-no-branch-warns-but-does-not-throw-test
  (testing "When remote sync is enabled (read-write) but no branch, no import happens, no throw"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          (collection/clear-remote-synced-collection!)
          (#'init/remote-sync-init)
          (is (empty? @calls)))))))

(deftest remote-sync-init-enabled-with-remote-synced-collection-no-import-test
  (testing "When a remote-synced collection already exists, no automatic import is triggered"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
            (#'init/remote-sync-init)
            (is (empty? @calls))))))))

(defn- wait-until
  "True once `pred` returns truthy, polling every 10 ms for up to `timeout-ms`; false otherwise."
  [pred timeout-ms]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (cond
        (pred)                                    true
        (> (System/currentTimeMillis) deadline)   false
        :else                                     (do (Thread/sleep 10) (recur))))))

(defn- new-task-id []
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)}))

(deftest remote-sync-shutdown-fails-this-jvms-running-tasks-test
  (testing "shutdown fails every task whose worker runs in this JVM and leaves a stale open row from elsewhere untouched"
    (let [other-id (new-task-id)
          _        (t2/update! :model/RemoteSyncTask other-id
                               {:last_progress_report_at (t/minus (t/offset-date-time) (t/hours 2))})
          own-id   (new-task-id)
          release  (promise)
          worker   (future (impl/run-task-body! own-id nil
                                                (fn [_] @release {:status :success :outcome {:kind "pull-skipped"}})))]
      (try
        (is (true? (wait-until #(contains? (impl/running-task-ids) own-id) 5000)))
        (startup/def-shutdown-logic! ::init/remote-sync-shutdown)
        (is (=? {:ended_at some? :cancelled false :error_message "Interrupted by server shutdown"}
                (t2/select-one :model/RemoteSyncTask :id own-id)))
        (is (=? {:ended_at nil :error_message nil}
                (t2/select-one :model/RemoteSyncTask :id other-id)))
        (finally
          (deliver release nil)
          (is (not= ::timeout (deref worker 10000 ::timeout)))))
      (testing "the worker's late result does not overwrite the shutdown bookkeeping"
        (is (=? {:error_message "Interrupted by server shutdown" :outcome nil}
                (t2/select-one :model/RemoteSyncTask :id own-id)))))))

(deftest remote-sync-init-supersedes-stale-tasks-test
  (testing "boot closes open task rows whose owner has been silent past the window and leaves fresh ones alone"
    (mt/with-temporary-setting-values [:remote-sync-url nil]
      (let [stale-id (new-task-id)
            _        (t2/update! :model/RemoteSyncTask stale-id
                                 {:last_progress_report_at (t/minus (t/offset-date-time) (t/hours 2))})
            fresh-id (new-task-id)]
        (#'init/remote-sync-init)
        (is (=? {:cancelled true :ended_at some? :error_message #"^Sync was interrupted.*"}
                (t2/select-one :model/RemoteSyncTask :id stale-id)))
        (is (=? {:cancelled false :ended_at nil :error_message nil}
                (t2/select-one :model/RemoteSyncTask :id fresh-id)))))))

;;; ------------------------------------------- Glossary ledger backfill -------------------------------------------

(defn- glossary-rso-count []
  (t2/count :model/RemoteSyncObject :model_type "Glossary"))

(defn- do-with-untracked-glossary-entry!
  "Runs `f` with one glossary entry and no Glossary ledger rows, under `remote-sync-type` `sync-type`."
  [sync-type f]
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                     :remote-sync-type sync-type
                                     :remote-sync-branch "main"]
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (t2/delete! :model/RemoteSyncObject :model_type "Glossary")
        (mt/with-dynamic-fn-redefs [impl/async-import! (constantly nil)
                                    remote-sync.object/dirty? (constantly false)]
          (f entry))))))

(deftest remote-sync-init-backfills-glossary-tracking-test
  (testing "Read-write with a synced Library tracks every untracked glossary entry as 'create', once"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry!
       :read-write
       (fn [entry]
         (#'init/remote-sync-init)
         (is (=? {:status "create" :model_name "ARR"}
                 (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry))))
         (is (= 1 (glossary-rso-count)))
         (testing "a second run inserts nothing"
           (#'init/remote-sync-init)
           (is (= 1 (glossary-rso-count)))))))))

(deftest remote-sync-init-glossary-backfill-tracks-only-untracked-entries-test
  (testing "A partially tracked glossary gets ledger rows for the untracked entries only; tracked rows are left alone"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry!
       :read-write
       (fn [entry]
         (mt/with-temp [:model/Glossary tracked {:term "MRR" :definition "Monthly recurring revenue"}]
           (t2/insert! :model/RemoteSyncObject {:model_type "Glossary" :model_id (:id tracked) :model_name "MRR"
                                                :status "synced" :status_changed_at (t/offset-date-time)})
           (#'init/remote-sync-init)
           (is (= 2 (glossary-rso-count)))
           (is (=? {:status "create" :model_name "ARR"}
                   (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry))))
           (is (=? {:status "synced" :model_name "MRR"}
                   (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id tracked))))))))))

(deftest backfill-glossary-tracking-returns-inserted-count-test
  (testing "the backfill returns how many ledger rows it inserted, and zero once every entry is tracked"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry!
       :read-write
       (fn [_entry]
         (is (= 1 (rs-events/backfill-glossary-tracking!)))
         (is (= 0 (rs-events/backfill-glossary-tracking!)))
         (is (= 1 (glossary-rso-count))))))))

(deftest remote-sync-init-glossary-backfill-skips-read-only-test
  (testing "A read-only instance is not backfilled"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry!
       :read-only
       (fn [_entry]
         (#'init/remote-sync-init)
         (is (zero? (glossary-rso-count))))))))

;;; -------------------------------------------- Action ledger backfill --------------------------------------------

(defn- do-with-untracked-actions!
  "Runs `f` with `{:live :archived :unsynced}` action ids and no Action ledger rows, under `remote-sync-type`
  `sync-type`. `:live` and `:archived` belong to a model in a synced collection, `:unsynced` to a model outside one."
  [sync-type f]
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                     :remote-sync-type sync-type
                                     :remote-sync-branch "main"]
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temp [:model/Collection {synced-id :id}   {:name "Synced" :is_remote_synced true :location "/"}
                     :model/Collection {plain-id :id}    {:name "Plain" :location "/"}
                     :model/Card       {model-id :id}    {:type :model :collection_id synced-id}
                     :model/Card       {other-id :id}    {:type :model :collection_id plain-id}
                     :model/Action     {live :id}        {:type :implicit :name "Live" :model_id model-id}
                     :model/Action     {archived :id}    {:type :implicit :name "Old" :model_id model-id :archived true}
                     :model/Action     {unsynced :id}    {:type :implicit :name "Elsewhere" :model_id other-id}]
        (t2/delete! :model/RemoteSyncObject :model_type "Action")
        (mt/with-dynamic-fn-redefs [impl/async-import! (constantly nil)
                                    remote-sync.object/dirty? (constantly false)]
          (f {:live live :archived archived :unsynced unsynced}))))))

(defn- action-rso-ids []
  (t2/select-fn-set :model_id :model/RemoteSyncObject :model_type "Action"))

(deftest remote-sync-init-backfills-action-tracking-test
  (testing "GHY-4722: read-write init tracks the unarchived actions of synced models as 'create', once, so the next push writes them"
    (do-with-untracked-actions!
     :read-write
     (fn [{:keys [live]}]
       (#'init/remote-sync-init)
       (is (= #{live} (action-rso-ids)))
       (is (=? {:status "create" :model_name "Live"}
               (t2/select-one :model/RemoteSyncObject :model_type "Action" :model_id live)))
       (testing "a second run inserts nothing"
         (#'init/remote-sync-init)
         (is (= 1 (t2/count :model/RemoteSyncObject :model_type "Action"))))))))

(deftest remote-sync-init-action-backfill-skips-read-only-test
  (testing "GHY-4722: a read-only instance is not backfilled"
    (do-with-untracked-actions!
     :read-only
     (fn [_]
       (#'init/remote-sync-init)
       (is (empty? (action-rso-ids)))))))

(deftest remote-sync-init-glossary-backfill-skips-unsynced-library-test
  (testing "Glossary entries are only tracked when the Library is synced"
    (collections.tu/with-library-not-synced
      (do-with-untracked-glossary-entry!
       :read-write
       (fn [_entry]
         (#'init/remote-sync-init)
         (is (zero? (glossary-rso-count))))))))

;;; ------------------------------------------- Data app ledger backfill -------------------------------------------

(defn- do-with-untracked-data-apps!
  "Runs `f` with `{:published :tracked}` data app ids under `remote-sync-type` `sync-type`, where only
  `:tracked` has a DataApp ledger row."
  [sync-type f]
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                     :remote-sync-type sync-type
                                     :remote-sync-branch "main"]
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/DataApp :model/Collection :model/PermissionsGroup]
      (let [insert-app! (fn [slug]
                          (t2/insert-returning-pk! :model/DataApp {:name         slug
                                                                   :display_name slug
                                                                   :bundle_path  "index.js"
                                                                   :bundle       (.getBytes "BUNDLE" "UTF-8")}))
            published   (insert-app! "published")
            tracked     (insert-app! "tracked")]
        (t2/delete! :model/RemoteSyncObject :model_type "DataApp")
        (t2/insert! :model/RemoteSyncObject {:model_type "DataApp" :model_id tracked :model_name "tracked"
                                             :status "synced" :status_changed_at (t/offset-date-time)})
        (mt/with-dynamic-fn-redefs [impl/async-import! (constantly nil)
                                    remote-sync.object/dirty? (constantly false)]
          (f {:published published :tracked tracked}))))))

(defn- data-app-rso-statuses []
  (t2/select-fn->fn :model_id :status :model/RemoteSyncObject :model_type "DataApp"))

(deftest remote-sync-init-backfills-data-app-tracking-test
  (testing "read-write init tracks every untracked published data app as 'create', once, so the next push writes it"
    (do-with-untracked-data-apps!
     :read-write
     (fn [{:keys [published tracked]}]
       (#'init/remote-sync-init)
       (is (= {published "create" tracked "synced"} (data-app-rso-statuses)))
       (is (=? {:model_name "published"}
               (t2/select-one :model/RemoteSyncObject :model_type "DataApp" :model_id published)))
       (testing "a second run inserts nothing"
         (is (= 0 (rs-events/backfill-data-app-tracking!))))))))

(deftest remote-sync-init-data-app-backfill-skips-read-only-test
  (testing "a read-only instance is not backfilled"
    (do-with-untracked-data-apps!
     :read-only
     (fn [{:keys [tracked]}]
       (#'init/remote-sync-init)
       (is (= {tracked "synced"} (data-app-rso-statuses)))))))

(defn- library-synced? []
  (boolean (:is_remote_synced (collection/library-collection))))

(defn- do-with-unsynced-library!
  "Runs `thunk` with an unsynced Library, leaving the Library unsynced afterward."
  [thunk]
  (collections.tu/with-library [_]
    (try
      (th/set-library-remote-synced! false)
      (thunk)
      (finally
        (th/set-library-remote-synced! false)))))

(deftest init-strict-mode-test
  (testing "Without a value, strict mode is on when no collection outside the Library is synced"
    (mt/with-temporary-setting-values [:remote-sync-strict-mode nil]
      (remote-sync.core/init-strict-mode!)
      (is (true? (settings/remote-sync-strict-mode)))))
  (testing "Without a value, strict mode is off when another collection is synced"
    (mt/with-temporary-setting-values [:remote-sync-strict-mode nil]
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
        (remote-sync.core/init-strict-mode!)
        (is (false? (settings/remote-sync-strict-mode))))))
  (testing "Snippet, data actions, data apps, and transforms collections don't count as other collections"
    (mt/with-temporary-setting-values [:remote-sync-strict-mode nil]
      (mt/with-temp [:model/Collection _ {:name "Snippets" :namespace "snippets" :is_remote_synced true}]
        (remote-sync.core/init-strict-mode!)
        (is (true? (settings/remote-sync-strict-mode))))))
  (testing "An existing value is kept"
    (mt/with-temporary-setting-values [:remote-sync-strict-mode false]
      (remote-sync.core/init-strict-mode!)
      (is (false? (settings/remote-sync-strict-mode))))))

(deftest remote-sync-init-sets-strict-mode-test
  (testing "Startup sets strict mode when it has no value, without creating the Library"
    (mt/with-temporary-setting-values [:remote-sync-url nil
                                       :remote-sync-strict-mode nil]
      (mt/with-dynamic-fn-redefs [collection/ensure-library-collection! #(throw (ex-info "Should not be called" {}))]
        (#'init/remote-sync-init)
        (is (true? (settings/remote-sync-strict-mode)))))))

(deftest finish-remote-config-strict-mode-test
  (testing "In strict mode, saving read-write remote sync settings turns on Library and transforms sync"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"
                                       :remote-sync-strict-mode true]
      (do-with-unsynced-library!
       (fn []
         (impl/finish-remote-config!)
         (is (library-synced?))
         (is (true? (settings/remote-sync-transforms)))
         (testing "every time, so neither can be turned off"
           (settings/remote-sync-transforms! false)
           (impl/finish-remote-config!)
           (is (true? (settings/remote-sync-transforms)))))))))

(deftest finish-remote-config-strict-mode-creates-library-test
  (testing "In strict mode, saving remote sync settings creates the Library"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"
                                       :remote-sync-strict-mode true]
      (is (nil? (collection/library-collection)))
      (mt/with-temp [:model/PythonLibrary {library-id :id} {:path      "common.py"
                                                            :source    ""
                                                            :entity_id transforms-python/builtin-entity-id}]
        (impl/finish-remote-config!)
        (is (library-synced?))
        (testing "and leaves nothing to push without content, ignoring the unchanged built-in Python library"
          (is (not (remote-sync.object/dirty?))))
        (testing "while a changed built-in Python library is tracked when transforms sync is turned on"
          (t2/update! :model/PythonLibrary library-id {:source "def f(): pass"})
          (settings/remote-sync-transforms! false)
          (settings/remote-sync-transforms! true)
          (is (remote-sync.object/dirty?)))))))

(deftest finish-remote-config-not-strict-mode-test
  (testing "Outside strict mode, saving remote sync settings leaves Library and transforms sync alone"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"
                                       :remote-sync-strict-mode false]
      (do-with-unsynced-library!
       (fn []
         (impl/finish-remote-config!)
         (is (not (library-synced?)))
         (is (false? (settings/remote-sync-transforms))))))))

(deftest finish-remote-config-read-only-test
  (testing "In strict mode, a read-only instance gets the Library but takes its sync state from its pulls"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-strict-mode true]
      (let [[_calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [impl/async-import! capture]
          (is (nil? (collection/library-collection)))
          (impl/finish-remote-config!)
          (is (some? (collection/library-collection)))
          (is (not (library-synced?)))
          (is (false? (settings/remote-sync-transforms))))))))

(deftest finish-remote-config-library-refused-test
  (testing "When the Library can't sync, saving remote sync settings fails while startup logs it and goes on"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"
                                       :remote-sync-strict-mode true]
      (mt/with-dynamic-fn-redefs [remote-sync.core/bulk-set-remote-sync
                                  (fn [_] (throw (ex-info "Uses content that is not remote synced." {})))]
        (do-with-unsynced-library!
         (fn []
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Uses content that is not remote synced"
                                 (impl/finish-remote-config!)))
           (is (not (library-synced?)))
           (let [[calls capture] (capture-async-import!)]
             (mt/with-dynamic-fn-redefs [impl/async-import! capture]
               (#'init/remote-sync-init)
               (is (= [["main" true {}]] @calls) "the rest of startup still runs")))))))))
