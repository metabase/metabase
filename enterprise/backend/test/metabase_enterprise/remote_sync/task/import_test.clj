(ns metabase-enterprise.remote-sync.task.import-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.task.import :as task.import]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fixtures/initialize :db)
  ;; the mock source's card yaml references the test-data database, so it must exist for import to succeed
  (fn [f] (mt/dataset test-data
            (mt/id)
            (f))))

(use-fixtures :each
  test-helpers/clean-remote-sync-state
  (fn [f]
    ;; :audit-app is needed for events to actually be recorded to the audit log
    (mt/with-premium-features #{:remote-sync :audit-app}
      (f))))

(deftest auto-import-writes-audit-log-entry-test
  (testing "GHY-3819: the background auto-import job publishes :event/remote-sync-import so the activity log records the pull"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :read-only
                                       remote-sync-auto-import true]
      (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
        (let [before (t2/count :model/AuditLog :topic "remote-sync-import")]
          (#'task.import/auto-import!)
          (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import")))
          (let [entry (t2/select-one :model/AuditLog :topic "remote-sync-import" {:order-by [[:id :desc]]})]
            (testing "system-triggered, so no user"
              (is (nil? (:user_id entry))))
            (testing "marked as automatic so it can be distinguished from manual imports"
              (is (true? (get-in entry [:details :auto]))))
            (testing "branch recorded in details"
              (is (= "main" (get-in entry [:details :branch])))))
          (testing "a no-op run (source version unchanged) does not log another entry"
            (#'task.import/auto-import!)
            (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import")))))))))

(deftest jekyll-boot-import-read-write-test
  (testing "jekyll-boot-import! imports on a read-write box (a Jekyll box must export, so it runs
            read-write — the read-only/auto-import gates only protect long-lived instances from
            pulling over unexported local edits, impossible on a fresh boot)"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :read-write
                                       remote-sync-auto-import false]
      (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
        (let [before (t2/count :model/AuditLog :topic "remote-sync-import")]
          (testing "auto-import! (the periodic task) still refuses under read-write"
            (#'task.import/auto-import!)
            (is (= before (t2/count :model/AuditLog :topic "remote-sync-import"))))
          (testing "jekyll-boot-import! imports"
            (task.import/jekyll-boot-import!)
            (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import"))))
          (testing "second boot-import is a no-op (version unchanged)"
            (task.import/jekyll-boot-import!)
            (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import")))))))))

(deftest jekyll-sync-conventions-test
  (testing "jekyll sync conventions: every top-level regular collection is remote-synced and
            transforms sync defaults on (jekyll-boot-import! runs this after the import)"
    (mt/with-temporary-setting-values [remote-sync-transforms nil]
      (mt/with-temp [:model/Collection top {:name "Top", :location "/"}
                     :model/Collection _archived {:name "Archived", :location "/", :archived true}]
        (let [unsynced-before (t2/select-pks-set :model/Collection :is_remote_synced false)]
          (try
            (#'task.import/jekyll-sync-conventions!)
            (testing "existing top-level collection marked synced"
              (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id (:id top)))))
            (testing "archived collection untouched"
              (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :name "Archived"))))
            (testing "personal collections untouched"
              (is (not-any? :is_remote_synced
                            (t2/select :model/Collection :personal_owner_id [:not= nil]))))
            (testing "transforms sync enabled when unset"
              (is (true? (settings/remote-sync-transforms))))
            (finally
              (t2/update! :model/Collection :id [:in unsynced-before] :is_remote_synced true
                          {:is_remote_synced false}))))))))

(deftest jekyll-sync-conventions-explicit-transforms-false-test
  (testing "an explicitly configured remote-sync-transforms=false survives the convention"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (#'task.import/jekyll-sync-conventions!)
      (is (false? (settings/remote-sync-transforms))))))

(deftest jekyll-sync-conventions-default-collection-test
  (testing "when no top-level regular collection exists, a synced 'Synced' collection is created"
    (mt/with-temporary-setting-values [remote-sync-transforms nil]
      (let [top-level-ids (t2/select-pks-set :model/Collection
                                             :location "/" :archived false :type nil
                                             :namespace nil :personal_owner_id nil)]
        (try
          (when (seq top-level-ids)
            (t2/update! :model/Collection :id [:in top-level-ids] {:archived true}))
          (#'task.import/jekyll-sync-conventions!)
          (is (true? (t2/select-one-fn :is_remote_synced :model/Collection
                                       :name "Synced" :location "/")))
          (finally
            (t2/delete! :model/Collection :name "Synced" :location "/" :is_remote_synced true)
            (when (seq top-level-ids)
              (t2/update! :model/Collection :id [:in top-level-ids] {:archived false}))))))))

(deftest jekyll-boot-missing-work-branch-test
  (testing "when the configured work branch doesn't exist, boot imports from the default branch and
            creates nothing — the work branch appears only when the first export has changes to push"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "bcm-work"
                                           remote-sync-type :read-write]
          (let [branches-before @(:branches-atom mock-source)
                imports-before (t2/count :model/AuditLog :topic "remote-sync-import")]
            (task.import/jekyll-boot-import!)
            (testing "no branch created"
              (is (= branches-before @(:branches-atom mock-source))))
            (testing "import still ran (from the default branch)"
              (is (= (inc imports-before) (t2/count :model/AuditLog :topic "remote-sync-import"))))))))))

(deftest jekyll-boot-import-unconfigured-test
  (testing "jekyll-boot-import! no-ops when url/branch are unset (remote-sync-enabled is derived from the url)"
    (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
      (let [before (t2/count :model/AuditLog :topic "remote-sync-import")]
        (testing "no url"
          (mt/with-temporary-setting-values [remote-sync-url nil
                                             remote-sync-branch "main"]
            (task.import/jekyll-boot-import!)
            (is (= before (t2/count :model/AuditLog :topic "remote-sync-import")))))
        (testing "no branch"
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch nil]
            (task.import/jekyll-boot-import!)
            (is (= before (t2/count :model/AuditLog :topic "remote-sync-import")))))))))
