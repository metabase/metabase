(ns metabase-enterprise.remote-sync.init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.init :as init]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
        (with-redefs [impl/async-import! capture]
          (#'init/remote-sync-init)
          (is (empty? @calls)))))))

(deftest remote-sync-init-read-only-without-branch-throws-test
  (testing "Read-only with enabled sync but no branch throws"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch nil]
      (with-redefs [remote-sync.object/dirty? (constantly false)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"no branch is set"
                              (#'init/remote-sync-init)))))))

(deftest remote-sync-init-read-only-dirty-without-allow-throws-test
  (testing "Read-only with dirty unpublished changes throws unless override is set"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-allow nil]
      (with-redefs [remote-sync.object/dirty? (constantly true)]
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
        (with-redefs [remote-sync.object/dirty? (constantly true)
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
        (with-redefs [remote-sync.object/dirty? (constantly false)
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
        (with-redefs [remote-sync.object/dirty? (constantly false)
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
        (with-redefs [remote-sync.object/dirty? (constantly false)
                      impl/async-import! capture]
          (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
            (#'init/remote-sync-init)
            (is (empty? @calls))))))))

;;; ------------------------------------------- Glossary ledger backfill -------------------------------------------

(defn- glossary-rso-count []
  (t2/count :model/RemoteSyncObject :model_type "Glossary"))

(defn- do-with-untracked-glossary-entry
  "Runs `f` with one glossary entry and no Glossary ledger rows, under `remote-sync-type` `sync-type`."
  [sync-type f]
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                     :remote-sync-type sync-type
                                     :remote-sync-branch "main"]
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (t2/delete! :model/RemoteSyncObject :model_type "Glossary")
        (with-redefs [impl/async-import! (constantly nil)
                      remote-sync.object/dirty? (constantly false)]
          (f entry))))))

(deftest remote-sync-init-backfills-glossary-tracking-test
  (testing "Read-write with a synced Library tracks every untracked glossary entry as 'create', once"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry
       :read-write
       (fn [entry]
         (#'init/remote-sync-init)
         (is (=? {:status "create" :model_name "ARR"}
                 (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry))))
         (is (= 1 (glossary-rso-count)))
         (testing "a second run inserts nothing"
           (#'init/remote-sync-init)
           (is (= 1 (glossary-rso-count)))))))))

(deftest remote-sync-init-glossary-backfill-skips-when-already-tracked-test
  (testing "An existing Glossary ledger row means the ledger is authoritative, so nothing is inserted"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry
       :read-write
       (fn [entry]
         (mt/with-temp [:model/Glossary tracked {:term "MRR" :definition "Monthly recurring revenue"}]
           (t2/insert! :model/RemoteSyncObject {:model_type "Glossary" :model_id (:id tracked) :model_name "MRR"
                                                :status "synced" :status_changed_at (java.time.OffsetDateTime/now)})
           (#'init/remote-sync-init)
           (is (= 1 (glossary-rso-count)))
           (is (nil? (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry))))))))))

(deftest remote-sync-init-glossary-backfill-skips-read-only-test
  (testing "A read-only instance is not backfilled"
    (collections.tu/with-library-synced
      (do-with-untracked-glossary-entry
       :read-only
       (fn [_entry]
         (#'init/remote-sync-init)
         (is (zero? (glossary-rso-count))))))))

(deftest remote-sync-init-glossary-backfill-skips-unsynced-library-test
  (testing "Glossary entries are only tracked when the Library is synced"
    (collections.tu/with-library-not-synced
      (do-with-untracked-glossary-entry
       :read-write
       (fn [_entry]
         (#'init/remote-sync-init)
         (is (zero? (glossary-rso-count))))))))
