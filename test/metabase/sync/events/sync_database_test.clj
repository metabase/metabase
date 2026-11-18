(ns metabase.sync.events.sync-database-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest new-database-is-synced-test
  (let [db    {:id 1 :is_full_sync true :is_stub false}
        calls (atom 0)]
    (mt/with-dynamic-fn-redefs [quick-task/submit-task!         (fn [task] (task))
                                sync/sync-database!             (fn [_] (swap! calls inc))
                                sync-metadata/sync-db-metadata! (fn [_] (swap! calls inc))]
      (testing "default (disable-auto-sync=false): a sync entry point is invoked"
        (reset! calls 0)
        (events/publish-event! :event/database-create {:object db :user-id (mt/user->id :crowberto)})
        (is (= 1 @calls)))
      (testing "with disable-auto-sync=true: no sync entry point is invoked"
        (reset! calls 0)
        (mt/with-temporary-setting-values [disable-auto-sync true]
          (events/publish-event! :event/database-create {:object db :user-id (mt/user->id :crowberto)}))
        (is (zero? @calls))))))

(deftest connected-stub-is-synced-test
  (let [stub      {:id 1 :is_full_sync true :is_stub true}
        db        {:id 2 :is_full_sync true :is_stub false}
        calls     (atom 0)
        connected (assoc stub :is_stub false)]
    (mt/with-dynamic-fn-redefs [quick-task/submit-task!         (fn [task] (task))
                                sync/sync-database!             (fn [_] (swap! calls inc))
                                sync-metadata/sync-db-metadata! (fn [_] (swap! calls inc))]
      (testing "a stub that gets connected is synced"
        (reset! calls 0)
        (events/publish-event! :event/database-update {:object connected :previous-object stub :user-id (mt/user->id :crowberto)})
        (is (= 1 @calls)))
      (testing "a stub that stays a stub is not synced"
        (reset! calls 0)
        (events/publish-event! :event/database-update {:object stub :previous-object stub :user-id (mt/user->id :crowberto)})
        (is (zero? @calls)))
      (testing "a regular database update is not synced"
        (reset! calls 0)
        (events/publish-event! :event/database-update {:object db :previous-object db :user-id (mt/user->id :crowberto)})
        (is (zero? @calls))))))

(defn- wait-for-initial-sync
  "The `initial_sync_status` of the Database `db-id` once its sync ends, or after a minute."
  [db-id]
  (loop [n 0]
    (let [status (t2/select-one-fn :initial_sync_status :model/Database :id db-id)]
      (if (or (#{"complete" "aborted"} status) (= n 120))
        status
        (do (Thread/sleep 500)
            (recur (inc n)))))))

(deftest database-created-by-user-is-synced-test
  (testing "a Database a user creates gets its initial sync, on a connection of its own, once the insert commits"
    (mt/with-model-cleanup [:model/Database]
      (let [db (mt/with-current-user (mt/user->id :crowberto)
                 (t2/insert-returning-instance! :model/Database {:name    (mt/random-name)
                                                                 :engine  :h2
                                                                 :details (:details (mt/db))}))]
        (is (= "complete" (wait-for-initial-sync (:id db))))
        (is (pos? (t2/count :model/Table :db_id (:id db))))))))

(deftest sync-submitted-after-commit-test
  (let [submitted (atom 0)
        row       (fn [] {:name (mt/random-name) :engine :h2 :details (:details (mt/db))})]
    (mt/with-model-cleanup [:model/Database]
      (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [_task] (swap! submitted inc))]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "a Database created in a transaction is synced once the transaction commits"
            (t2/with-transaction [_conn]
              (t2/insert! :model/Database (row))
              (is (zero? @submitted)))
            (is (= 1 @submitted)))
          (testing "a Database created in a transaction that rolls back is never synced"
            (reset! submitted 0)
            (t2/with-transaction [_conn nil {:rollback-only true}]
              (t2/insert! :model/Database (row)))
            (is (zero? @submitted))))))))
