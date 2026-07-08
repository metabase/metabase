(ns metabase-enterprise.remote-sync.task.import-test
  (:require
   [clojure.test :refer :all]
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
