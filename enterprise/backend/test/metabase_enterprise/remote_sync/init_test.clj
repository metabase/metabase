(ns metabase-enterprise.remote-sync.init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.init :as init]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]))

(defn- capture-async-import! []
  (let [calls (atom [])]
    [calls (fn [branch force? args] (swap! calls conj [branch force? args]) nil)]))

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
