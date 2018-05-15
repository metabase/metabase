(ns metabase.sync.util-test
  "Tests for the utility functions shared by all parts of sync, such as the duplicate ops guard."
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [sync :as sync]]
            [metabase.models.database :refer [Database]]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Duplicate Sync Prevention                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we prevent running simultaneous syncs on the same database

(defonce ^:private calls-to-describe-database (atom 0))

(defrecord ConcurrentSyncTestDriver []
  clojure.lang.Named
  (getName [_] "ConcurrentSyncTestDriver"))

(extend ConcurrentSyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database (fn [_ _]
                               (swap! calls-to-describe-database inc)
                               (Thread/sleep 1000)
                               {:tables #{}})
          :describe-table    (constantly nil)
          :details-fields    (constantly [])}))

(driver/register-driver! :concurrent-sync-test (ConcurrentSyncTestDriver.))

;; only one sync should be going on at a time
(expect
 ;; describe-database gets called twice during a single sync process, once for syncing tables and a second time for
 ;; syncing the _metabase_metadata table
 2
 (tt/with-temp* [Database [db {:engine :concurrent-sync-test}]]
   (reset! calls-to-describe-database 0)
   ;; start a sync processes in the background. It should take 1000 ms to finish
   (let [f1 (future (sync/sync-database! db))
         f2 (do
              ;; wait 200 ms to make sure everything is going
              (Thread/sleep 200)
              ;; Start another in the background. Nothing should happen here because the first is already running
              (future (sync/sync-database! db)))]
     ;; Start another in the foreground. Again, nothing should happen here because the original should still be
     ;; running
     (sync/sync-database! db)
     ;; make sure both of the futures have finished
     (deref f1)
     (deref f2)
     ;; Check the number of syncs that took place. Should be 2 (just the first)
     @calls-to-describe-database)))
