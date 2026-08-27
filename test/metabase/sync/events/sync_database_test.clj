(ns metabase.sync.events.sync-database-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(deftest database-create-event-respects-disable-auto-sync-test
  (testing "The :event/database-create handler kicks off a sync on a new thread by default"
    (mt/with-temp [:model/Database {:as db} {:is_full_sync true}]
      (let [calls (atom 0)]
        (with-redefs [quick-task/submit-task!         (fn [task] (task))
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
            (is (zero? @calls))))))))
